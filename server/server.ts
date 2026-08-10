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
          const response: SignalMessage = {
            type: 'SESSION_CREATED',
            sessionId,
            peerId
          };
          ws.send(JSON.stringify(response));
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
          
          // Notify newly joined peer of success and host ID
          ws.send(JSON.stringify({
            type: 'SESSION_JOINED',
            sessionId: msg.sessionId,
            peerId,
            targetPeerId: result.hostId
          }));

          // Notify the host peer that a client joined
          if (result.hostId) {
            const hostPeer = (sessionManager as any).peers.get(result.hostId);
            if (hostPeer && hostPeer.ws.readyState === WebSocket.OPEN) {
              hostPeer.ws.send(JSON.stringify({
                type: 'PEER_JOINED',
                peerId
              }));
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
    sessionManager.removePeer(peerId);
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
