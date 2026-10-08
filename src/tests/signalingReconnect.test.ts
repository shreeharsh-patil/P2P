import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignalingClient } from '../network/SignalingClient';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static sockets: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: any[] = [];

  constructor(_url: string) { FakeWebSocket.sockets.push(this); }
  open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  close() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
  fail() { this.onerror?.(); if (this.readyState !== FakeWebSocket.CLOSED) this.close(); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  receive(msg: any) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

describe('SignalingClient reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.sockets = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('window', { location: { protocol: 'http:', hostname: 'localhost' } });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('retries after multiple failed attempts instead of getting stuck', async () => {
    const client = new SignalingClient('ws://local/ws');
    const attempt = client.connect();
    FakeWebSocket.sockets[0].fail();
    await expect(attempt).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.sockets).toHaveLength(2);
    FakeWebSocket.sockets[1].fail();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeWebSocket.sockets).toHaveLength(3);
    FakeWebSocket.sockets[2].open();
    expect(client.isOnline()).toBe(true);
    client.disconnect();
  });

  it('authenticates the resume attempt before replaying session requests', async () => {
    const client = new SignalingClient('ws://local/ws');
    const attempt = client.connect();
    const first = FakeWebSocket.sockets[0];
    first.open();
    await attempt;
    first.receive({ type: 'SESSION_CREATED', peerId: 'host', sessionId: '123456', resumeToken: 'secret' });
    first.close();
    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeWebSocket.sockets[1];
    second.open();
    expect(second.sent[0]).toMatchObject({
      type: 'RESUME_SESSION', sessionId: '123456', resumeToken: 'secret'
    });
    second.receive({ type: 'SESSION_RESUMED', sessionId: '123456', peerId: 'host', resumeToken: 'secret' });
    expect(client.sessionId).toBe('123456');
    client.disconnect();
  });
});
