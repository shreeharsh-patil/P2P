import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { SessionManager, SESSION_RECONNECT_GRACE_MS } from '../../server/SessionManager';

class FakeSocket {
  readyState: number = WebSocket.OPEN;
  sent: any[] = [];
  send(message: string) { this.sent.push(JSON.parse(message)); }
  close() { this.readyState = WebSocket.CLOSED; }
}
const socket = () => new FakeSocket() as unknown as WebSocket;

describe('signaling room reconnect', () => {
  it('restores the same host code after a temporary socket failure', () => {
    const sessions = new SessionManager();
    const first = socket();
    const code = sessions.createSession('host-1', first);
    const token = sessions.getPeer('host-1')!.resumeToken;
    sessions.suspendPeer('host-1', first);
    expect(sessions.getSessionInfo(code)?.hostId).toBe('host-1');
    const second = socket();
    expect(sessions.resumeSession(code, token, second)).toMatchObject({
      success: true, peerId: 'host-1', isHost: true
    });
    sessions.suspendPeer('host-1', first); // a stale close must not remove the replacement
    expect(sessions.isOnline('host-1')).toBe(true);
  });

  it('rejects invalid tokens and an occupied room', () => {
    const sessions = new SessionManager();
    const code = sessions.createSession('host', socket());
    expect(sessions.resumeSession(code, 'wrong-token', socket()).success).toBe(false);
    expect(sessions.joinSession(code, 'guest', socket()).success).toBe(true);
    expect(sessions.joinSession(code, 'intruder', socket()).success).toBe(false);
    expect(sessions.getSessionInfo(code)?.clientId).toBe('guest');
  });

  it('keeps the room after guest departure, but not after host departure', () => {
    const sessions = new SessionManager();
    const code = sessions.createSession('host', socket());
    sessions.joinSession(code, 'guest', socket());
    sessions.leavePeer('guest');
    expect(sessions.getSessionInfo(code)?.hostId).toBe('host');
    expect(sessions.joinSession(code, 'new-guest', socket()).success).toBe(true);
    sessions.leavePeer('host');
    expect(sessions.getSessionInfo(code)).toBeUndefined();
  });

  it('expires abandoned sessions after the reconnect grace window', () => {
    const sessions = new SessionManager();
    const hostSocket = socket();
    const code = sessions.createSession('host', hostSocket);
    sessions.suspendPeer('host', hostSocket);
    sessions.pruneStale(Date.now() + SESSION_RECONNECT_GRACE_MS + 1000);
    expect(sessions.getSessionInfo(code)).toBeUndefined();
  });
});
