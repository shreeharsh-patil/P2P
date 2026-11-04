import express from 'express';
import { createServer } from 'http';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { SessionManager, SESSION_RECONNECT_GRACE_MS } from './SessionManager.js';
import { SignalMessage } from './signalingTypes.js';

const app = express();
const silent = process.env.LOG_SILENT === '1';
const log = (...args: unknown[]) => {
  if (!silent) console.log(...args);
};

// Only allow browser origins that are explicitly configured. When nothing is
// configured (local development) the wildcard behaviour is kept.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0) return callback(null, true);
      callback(null, allowedOrigins.includes(origin));
    }
  })
);
app.use(express.json({ limit: '64kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

const server = createServer(app);
const wss = new WebSocketServer({
  server,
  path: '/ws',
  // A relayed 60 KiB chunk is ~80 KiB as base64 JSON; anything far above
  // that is a client bug or an attempt to exhaust server memory.
  maxPayload: 1024 * 1024
});
const sessionManager = new SessionManager();

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dynamic ICE server config endpoint
app.get('/api/ice-servers', (_req, res) => {
  const iceServers: any[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  // If custom TURN credentials are set via environment variables, add them
  const turnUrl = process.env.TURN_URL;
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL;
  if (turnUrl && turnUsername && turnCredential) {
    iceServers.push({
      urls: [turnUrl, `${turnUrl}?transport=tcp`],
      username: turnUsername,
      credential: turnCredential
    });
  }

  res.json({ iceServers });
});

// Serve the built client when running the bundled production image.
const distDir = path.resolve(process.cwd(), 'dist');
app.use(
  express.static(distDir, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  })
);
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/ws') return next();
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(distDir, 'index.html'), (error) => {
    if (error) next();
  });
});

// ---------------------------------------------------------------------------
// Abuse protection: the signaling server is publicly reachable, so session
// creation, joining and relay traffic must all be bounded.
// ---------------------------------------------------------------------------

const ACTION_WINDOW_MS = 60_000;
const MAX_CREATES_PER_WINDOW = 5;
const MAX_JOINS_PER_WINDOW = 10;
const MAX_MESSAGES_PER_WINDOW = 1200;
const MAX_CONNECTIONS_PER_IP = 20;

function allowAction(bucket: number[], limit: number, windowMs = ACTION_WINDOW_MS): boolean {
  const now = Date.now();
  while (bucket.length > 0 && now - bucket[0] > windowMs) bucket.shift();
  if (bucket.length >= limit) return false;
  bucket.push(now);
  return true;
}

const connectionsByIp = new Map<string, number>();

wss.on('connection', (ws: WebSocket, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const active = connectionsByIp.get(ip) ?? 0;
  if (active >= MAX_CONNECTIONS_PER_IP) {
    ws.close(4003, 'Too many connections');
    return;
  }
  connectionsByIp.set(ip, active + 1);

  const peerId: string = sessionManager.generatePeerId();
  let currentSessionId: string | null = null;
  let missedPongs = 0;
  const createAttempts: number[] = [];
  const joinAttempts: number[] = [];
  const messageAttempts: number[] = [];

  ws.on('pong', () => {
    missedPongs = 0;
  });
  const keepAlive = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (++missedPongs > 2) {
      ws.terminate();
      return;
    }
    ws.ping();
  }, 25_000);

  log(`[WS] Peer connected: ${peerId}`);

  // Send a welcome message so the client knows its peer ID immediately
  ws.send(JSON.stringify({ type: 'WELCOME', peerId }));

  ws.on('message', (data: Buffer) => {
    try {
      if (!allowAction(messageAttempts, MAX_MESSAGES_PER_WINDOW)) {
        ws.close(4008, 'Rate limit exceeded');
        return;
      }
      const msg: SignalMessage = JSON.parse(data.toString());
      log(`[WS] ${peerId} -> ${msg.type}${msg.sessionId ? ` session=${msg.sessionId}` : ''}`);

      switch (msg.type) {
        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;

        case 'CREATE_SESSION': {
          if (!allowAction(createAttempts, MAX_CREATES_PER_WINDOW)) {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Too many session attempts. Try again shortly.' }));
            return;
          }
          const sessionId = sessionManager.createSession(peerId, ws);
          currentSessionId = sessionId;
          log(`[SESSION] Created: ${sessionId}`);
          ws.send(JSON.stringify({
            type: 'SESSION_CREATED',
            sessionId,
            peerId,
            resumeToken: sessionManager.getPeer(peerId)?.resumeToken
          }));
          break;
        }

        case 'JOIN_SESSION': {
          if (!msg.sessionId) {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Session ID is required' }));
            return;
          }
          if (!allowAction(joinAttempts, MAX_JOINS_PER_WINDOW)) {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Too many join attempts. Try again shortly.' }));
            return;
          }
          const result = sessionManager.joinSession(msg.sessionId, peerId, ws);
          if (!result.success) {
            log(`[SESSION] Join FAILED: ${msg.sessionId} — ${result.error}`);
            ws.send(JSON.stringify({ type: 'ERROR', error: result.error }));
            return;
          }

          currentSessionId = msg.sessionId;
          log(`[SESSION] Joined: ${msg.sessionId} by client ${peerId}`);

          // Tell the joiner: "you joined, here's the host's peerId so you know who to expect the offer from"
          ws.send(JSON.stringify({
            type: 'SESSION_JOINED',
            sessionId: msg.sessionId,
            peerId,
            targetPeerId: result.hostId,
            resumeToken: sessionManager.getPeer(peerId)?.resumeToken
          }));

          // Tell the host: "a client joined, here's their peerId — send them an offer"
          if (result.hostId) {
            const hostPeer = sessionManager.getPeer(result.hostId);
            if (hostPeer?.ws?.readyState === WebSocket.OPEN) {
              hostPeer.ws.send(JSON.stringify({
                type: 'PEER_JOINED',
                peerId
              }));
            } else {
              console.warn(`[SESSION] Host peer ${result.hostId} not found or disconnected!`);
            }
          }
          break;
        }

        case 'RESUME_SESSION': {
          if (!msg.sessionId || !msg.resumeToken) {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Missing session resume credentials.' }));
            break;
          }
          const result = sessionManager.resumeSession(msg.sessionId, msg.resumeToken, ws);
          if (!result.success) {
            ws.send(JSON.stringify({ type: 'ERROR', error: result.error }));
            break;
          }
          currentSessionId = msg.sessionId;
          ws.send(JSON.stringify({
            type: 'SESSION_RESUMED',
            sessionId: currentSessionId,
            peerId: result.peerId,
            targetPeerId: result.targetPeerId,
            resumeToken: sessionManager.getPeer(result.peerId!)?.resumeToken,
            isHost: result.isHost
          }));
          const session = sessionManager.getSessionInfo(currentSessionId);
          if (session?.clientId && sessionManager.isOnline(session.hostId) &&
              sessionManager.isOnline(session.clientId)) {
            const client = sessionManager.getPeer(session.clientId);
            const host = sessionManager.getPeer(session.hostId);
            // Prepare the returning client before its host starts a new offer.
            if (result.isHost) {
              client?.ws?.send(JSON.stringify({ type: 'PEER_READY', peerId: session.hostId }));
            }
            host?.ws?.send(JSON.stringify({
              type: 'PEER_JOINED', peerId: session.clientId,
              forceReconnect: !result.isHost
            }));
          }
          break;
        }

        case 'LEAVE_SESSION': {
          sessionManager.leavePeer(peerId);
          currentSessionId = null;
          break;
        }

        case 'SIGNAL': {
          if (msg.targetPeerId && msg.payload) {
            const relayed = sessionManager.handleSignal(peerId, msg.targetPeerId, msg.payload);
            if (!relayed) {
              log(`[SIGNAL] Failed to relay from ${peerId} — target not found or offline`);
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error('[WS] Error processing message:', err);
    }
  });

  ws.on('close', () => {
    clearInterval(keepAlive);
    const remaining = (connectionsByIp.get(ip) ?? 1) - 1;
    if (remaining <= 0) connectionsByIp.delete(ip);
    else connectionsByIp.set(ip, remaining);
    log(`[WS] Peer disconnected: ${peerId} (session: ${currentSessionId})`);
    sessionManager.suspendPeer(peerId, ws);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for peer ${peerId}:`, err);
  });
});

// Reclaim inactive peers and 6-digit codes after their reconnect grace period.
setInterval(() => sessionManager.pruneStale(), Math.min(30_000, SESSION_RECONNECT_GRACE_MS));

const PORT = process.env.PORT || 4050;
server.listen(PORT, () => {
  console.log(`Shree Signaling Server listening on port ${PORT}`);
  if (allowedOrigins.length === 0) {
    console.warn('[CORS] ALLOWED_ORIGINS is not set; accepting requests from any origin.');
  }
});
