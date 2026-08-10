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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dynamic ICE server config endpoint.
// Set TURN_USERNAME and TURN_CREDENTIAL environment variables in your Render dashboard.
// If not set, falls back to reliable public STUN + known-good free TURN servers.
app.get('/api/ice-servers', (req, res) => {
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    // OpenRelay public TURN — always available, no account needed
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

  // If custom TURN credentials are set via environment variables, add them too
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
  let peerId: string = Math.random().toString(36).substring(2, 11);
  let currentSessionId: string | null = null;

  ws.on('message', (data: string) => {
    try {
      const msg: SignalMessage = JSON.parse(data.toString());

      switch (msg.type) {
        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;

        case 'CREATE_SESSION': {
          const sessionId = sessionManager.createSession(peerId, ws);
          currentSessionId = sessionId;
          ws.send(JSON.stringify({
            type: 'SESSION_CREATED',
            sessionId,
            peerId
          } as SignalMessage));
          break;
        }

        case 'JOIN_SESSION': {
          if (!msg.sessionId) {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Session ID is required' }));
            return;
          }
          const result = sessionManager.joinSession(msg.sessionId, peerId, ws);
          if (!result.success) {
            ws.send(JSON.stringify({ type: 'ERROR', error: result.error }));
            return;
          }

          currentSessionId = msg.sessionId;

          // Notify joiner with host's peer ID so WebRTC offer can be directed correctly
          ws.send(JSON.stringify({
            type: 'SESSION_JOINED',
            sessionId: msg.sessionId,
            peerId,
            targetPeerId: result.hostId
          } as SignalMessage));

          // Notify host that a client has joined
          if (result.hostId) {
            const hostPeer = (sessionManager as any).peers.get(result.hostId);
            if (hostPeer && hostPeer.ws.readyState === WebSocket.OPEN) {
              hostPeer.ws.send(JSON.stringify({
                type: 'PEER_JOINED',
                peerId
              } as SignalMessage));
            }
          }
          break;
        }

        case 'SIGNAL': {
          if (msg.targetPeerId && msg.payload) {
            sessionManager.handleSignal(peerId, msg.targetPeerId, msg.payload);
          }
          break;
        }
      }
    } catch (err) {
      console.error('Error processing signaling message:', err);
    }
  });

  ws.on('close', () => {
    if (currentSessionId) {
      sessionManager.removePeer(peerId);
    }
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for peer ${peerId}:`, err);
    sessionManager.removePeer(peerId);
  });
});

const PORT = process.env.PORT || 4050;
server.listen(PORT, () => {
  console.log(`Shree Signaling Server listening on port ${PORT}`);
});
