import { WebSocket } from 'ws';
import { SignalMessage } from './signalingTypes.js';

interface ConnectedPeer {
  peerId: string;
  sessionId: string;
  ws: WebSocket;
}

export class SessionManager {
  private sessions: Map<string, { hostId: string; clientId?: string }> = new Map();
  private peers: Map<string, ConnectedPeer> = new Map();

  public generateSessionCode(): string {
    let code: string;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.sessions.has(code));
    return code;
  }

  public createSession(peerId: string, ws: WebSocket): string {
    this.removePeer(peerId);
    const sessionId = this.generateSessionCode();
    this.sessions.set(sessionId, { hostId: peerId });
    this.peers.set(peerId, { peerId, sessionId, ws });
    return sessionId;
  }

  public joinSession(sessionId: string, peerId: string, ws: WebSocket): { success: boolean; hostId?: string; error?: string } {
    this.removePeer(peerId);
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Session not found. Please check the code.' };
    }
    if (session.clientId && session.clientId !== peerId) {
      return { success: false, error: 'Session is full. Maximum 2 peers allowed.' };
    }

    session.clientId = peerId;
    this.peers.set(peerId, { peerId, sessionId, ws });
    return { success: true, hostId: session.hostId };
  }

  public getPeer(peerId: string): ConnectedPeer | undefined {
    return this.peers.get(peerId);
  }

  public handleSignal(senderPeerId: string, targetPeerId: string, payload: any): boolean {
    const senderPeer = this.peers.get(senderPeerId);
    const targetPeer = this.peers.get(targetPeerId);
    if (
      senderPeer &&
      targetPeer &&
      senderPeer.sessionId === targetPeer.sessionId &&
      targetPeer.ws.readyState === WebSocket.OPEN
    ) {
      const message: SignalMessage = {
        type: 'SIGNAL',
        peerId: senderPeerId,
        payload
      };
      targetPeer.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  public removePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    const { sessionId } = peer;
    const session = this.sessions.get(sessionId);

    this.peers.delete(peerId);

    if (session) {
      const otherPeerId = session.hostId === peerId ? session.clientId : session.hostId;
      if (otherPeerId) {
        const otherPeer = this.peers.get(otherPeerId);
        if (otherPeer && otherPeer.ws.readyState === WebSocket.OPEN) {
          const message: SignalMessage = {
            type: 'PEER_LEFT',
            peerId
          };
          otherPeer.ws.send(JSON.stringify(message));
        }
      }

      if (session.hostId === peerId) {
        if (session.clientId) {
          session.hostId = session.clientId;
          delete session.clientId;
        } else {
          this.sessions.delete(sessionId);
        }
      } else if (session.clientId === peerId) {
        delete session.clientId;
      }
    }
  }

  public getSessionInfo(sessionId: string) {
    return this.sessions.get(sessionId);
  }
}
