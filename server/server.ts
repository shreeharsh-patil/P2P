import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { SessionManager } from './SessionManager.js';
import { SignalMessage } from './signalingTypes.js';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
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

wss.on('connection', (ws: WebSocket) => {
  const peerId: string = Math.random().toString(36).substring(2, 11);
  let currentSessionId: string | null = null;

  console.log(`[WS] Peer connected: ${peerId}`);

  // Send a welcome message so the client knows its peer ID immediately
  ws.send(JSON.stringify({ type: 'WELCOME', peerId }));

  ws.on('message', (data: string) => {
    try {
      const msg: SignalMessage = JSON.parse(data.toString());
      console.log(`[WS] ${peerId} -> ${msg.type}${msg.sessionId ? ` session=${msg.sessionId}` : ''}${msg.targetPeerId ? ` target=${msg.targetPeerId}` : ''}`);

      switch (msg.type) {
        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;

        case 'CREATE_SESSION': {
          const sessionId = sessionManager.createSession(peerId, ws);
          currentSessionId = sessionId;
          console.log(`[SESSION] Created: ${sessionId} by host ${peerId}`);
          ws.send(JSON.stringify({
            type: 'SESSION_CREATED',
            sessionId,
            peerId
          }));
          break;
        }

        case 'JOIN_SESSION': {
          if (!msg.sessionId) {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Session ID is required' }));
            return;
          }
          const result = sessionManager.joinSession(msg.sessionId, peerId, ws);
          if (!result.success) {
            console.log(`[SESSION] Join FAILED: ${msg.sessionId} by ${peerId} — ${result.error}`);
            ws.send(JSON.stringify({ type: 'ERROR', error: result.error }));
            return;
          }

          currentSessionId = msg.sessionId;
          console.log(`[SESSION] Joined: ${msg.sessionId} by client ${peerId}, host is ${result.hostId}`);

          // Tell the joiner: "you joined, here's the host's peerId so you know who to expect the offer from"
          ws.send(JSON.stringify({
            type: 'SESSION_JOINED',
            sessionId: msg.sessionId,
            peerId,
            targetPeerId: result.hostId
          }));

          // Tell the host: "a client joined, here's their peerId — send them an offer"
          if (result.hostId) {
            const hostPeer = sessionManager.getPeer(result.hostId);
            if (hostPeer && hostPeer.ws.readyState === WebSocket.OPEN) {
              console.log(`[SESSION] Notifying host ${result.hostId} that client ${peerId} joined`);
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

        case 'SIGNAL': {
          if (msg.targetPeerId && msg.payload) {
            const relayed = sessionManager.handleSignal(peerId, msg.targetPeerId, msg.payload);
            if (!relayed) {
              console.warn(`[SIGNAL] Failed to relay from ${peerId} to ${msg.targetPeerId} — target not found`);
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
    console.log(`[WS] Peer disconnected: ${peerId} (session: ${currentSessionId})`);
    sessionManager.removePeer(peerId);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for peer ${peerId}:`, err);
    sessionManager.removePeer(peerId);
  });
});

const PORT = process.env.PORT || 4050;
server.listen(PORT, () => {
  console.log(`Shree Signaling Server listening on port ${PORT}`);
});
