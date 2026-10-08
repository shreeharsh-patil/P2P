import { randomBytes } from 'node:crypto';
import { WebSocket } from 'ws';
import { SignalMessage } from './signalingTypes.js';

interface ConnectedPeer {
  peerId: string;
  sessionId: string;
  ws: WebSocket | null;
  resumeToken: string;
  disconnectedAt: number | null;
}

interface Session {
  hostId: string;
  clientId?: string;
}

// Retain temporary socket outages without permanently occupying abandoned sessions.
export const SESSION_RECONNECT_GRACE_MS = 2 * 60 * 1000;

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private peers: Map<string, ConnectedPeer> = new Map();

  public generateSessionCode(): string {
    let code: string;
    do {
      code = Math.floor(100000 + Math.random() * 900000).toString();
    } while (this.sessions.has(code));
    return code;
  }

  private registerPeer(peerId: string, sessionId: string, ws: WebSocket): ConnectedPeer {
    const peer: ConnectedPeer = {
      peerId, sessionId, ws,
      resumeToken: randomBytes(32).toString('hex'),
      disconnectedAt: null
    };
    this.peers.set(peerId, peer);
    return peer;
  }

  public createSession(peerId: string, ws: WebSocket): string {
    this.leavePeer(peerId);
    const sessionId = this.generateSessionCode();
    this.sessions.set(sessionId, { hostId: peerId });
    this.registerPeer(peerId, sessionId, ws);
    return sessionId;
  }

  public joinSession(sessionId: string, peerId: string, ws: WebSocket): { success: boolean; hostId?: string; error?: string } {
    this.pruneStale();
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session not found. Please check the code.' };
    if (!this.isOnline(session.hostId)) {
      return { success: false, error: 'Host is reconnecting. Please retry in a moment.' };
    }
    if (session.clientId && session.clientId !== peerId) {
      return { success: false, error: 'Session is full. Maximum 2 peers allowed.' };
    }

    // Do not destroy the caller's existing session on a failed join.
    if (this.peers.get(peerId)?.sessionId !== sessionId) this.leavePeer(peerId);
    session.clientId = peerId;
    this.registerPeer(peerId, sessionId, ws);
    return { success: true, hostId: session.hostId };
  }

  public getPeer(peerId: string): ConnectedPeer | undefined {
    return this.peers.get(peerId);
  }

  public isOnline(peerId: string): boolean {
    return this.peers.get(peerId)?.ws?.readyState === WebSocket.OPEN;
  }

  public resumeSession(sessionId: string, token: string, ws: WebSocket): {
    success: boolean; peerId?: string; targetPeerId?: string; isHost?: boolean; error?: string
  } {
    this.pruneStale();
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session expired. Create or join a new session.' };
    const peerId = [session.hostId, session.clientId].find(id =>
      id && this.peers.get(id)?.resumeToken === token
    );
    if (!peerId) return { success: false, error: 'Session resume token is invalid.' };
    const peer = this.peers.get(peerId)!;
    const oldSocket = peer.ws;
    peer.ws = ws;
    peer.disconnectedAt = null;
    if (oldSocket && oldSocket !== ws && oldSocket.readyState === WebSocket.OPEN) {
      oldSocket.close(4001, 'Connection replaced');
    }
    const isHost = session.hostId === peerId;
    return {
      success: true,
      peerId,
      isHost,
      targetPeerId: isHost ? session.clientId : session.hostId
    };
  }

  public handleSignal(senderPeerId: string, targetPeerId: string, payload: unknown): boolean {
    const sender = this.peers.get(senderPeerId);
    const target = this.peers.get(targetPeerId);
    if (sender?.ws?.readyState === WebSocket.OPEN &&
        target?.ws?.readyState === WebSocket.OPEN &&
        sender.sessionId === target.sessionId) {
      const message: SignalMessage = { type: 'SIGNAL', peerId: senderPeerId, payload };
      target.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  public suspendPeer(peerId: string, ws: WebSocket): void {
    const peer = this.peers.get(peerId);
    // Ignore a late close from a socket already replaced by a resumed one.
    if (!peer || peer.ws !== ws) return;
    peer.ws = null;
    peer.disconnectedAt = Date.now();
    this.notifyOther(peer, 'PEER_PAUSED');
  }

  private notifyOther(peer: ConnectedPeer, type: SignalMessage['type']): void {
    const session = this.sessions.get(peer.sessionId);
    const otherId = session?.hostId === peer.peerId ? session.clientId : session?.hostId;
    const other = otherId ? this.peers.get(otherId) : undefined;
    if (other?.ws?.readyState === WebSocket.OPEN) {
      other.ws.send(JSON.stringify({ type, peerId: peer.peerId }));
    }
  }

  public leavePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const session = this.sessions.get(peer.sessionId);
    this.notifyOther(peer, 'PEER_LEFT');
    this.peers.delete(peerId);
    if (!session) return;

    if (session.hostId === peerId) {
      if (session.clientId) this.peers.delete(session.clientId);
      this.sessions.delete(peer.sessionId);
    } else if (session.clientId === peerId) {
      delete session.clientId;
    }
  }

  public pruneStale(now = Date.now()): void {
    for (const peer of Array.from(this.peers.values())) {
      if (peer.disconnectedAt !== null && now - peer.disconnectedAt >= SESSION_RECONNECT_GRACE_MS) {
        this.leavePeer(peer.peerId);
      }
    }
  }

  public getSessionInfo(sessionId: string) {
    return this.sessions.get(sessionId);
  }
}
