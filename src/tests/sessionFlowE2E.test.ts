import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { SessionManager } from '../../server/SessionManager';
import { SignalingClient } from '../network/SignalingClient';
import { WebRTCManager } from '../network/WebRTCManager';

async function startTestSignalingServer() {
  const server = createServer();
  const wss = new WebSocketServer({ server, path: '/ws' });
  const sessions = new SessionManager();

  wss.on('connection', (ws) => {
    let peerId = Math.random().toString(36).substring(2, 11);
    ws.send(JSON.stringify({ type: 'WELCOME', peerId }));

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      } else if (msg.type === 'CREATE_SESSION') {
        const sessionId = sessions.createSession(peerId, ws);
        ws.send(JSON.stringify({
          type: 'SESSION_CREATED',
          sessionId,
          peerId,
          resumeToken: sessions.getPeer(peerId)?.resumeToken
        }));
      } else if (msg.type === 'JOIN_SESSION') {
        const res = sessions.joinSession(msg.sessionId, peerId, ws);
        if (!res.success) {
          ws.send(JSON.stringify({ type: 'ERROR', error: res.error }));
          return;
        }
        ws.send(JSON.stringify({
          type: 'SESSION_JOINED',
          sessionId: msg.sessionId,
          peerId,
          targetPeerId: res.hostId,
          resumeToken: sessions.getPeer(peerId)?.resumeToken
        }));
        const host = res.hostId ? sessions.getPeer(res.hostId) : undefined;
        host?.ws?.send(JSON.stringify({ type: 'PEER_JOINED', peerId }));
      } else if (msg.type === 'RESUME_SESSION') {
        const res = sessions.resumeSession(msg.sessionId, msg.resumeToken, ws);
        if (!res.success) {
          ws.send(JSON.stringify({ type: 'ERROR', error: res.error }));
          return;
        }
        peerId = res.peerId!;
        ws.send(JSON.stringify({
          type: 'SESSION_RESUMED',
          sessionId: msg.sessionId,
          peerId,
          targetPeerId: res.targetPeerId,
          resumeToken: sessions.getPeer(peerId)?.resumeToken,
          isHost: res.isHost
        }));
      } else if (msg.type === 'LEAVE_SESSION') {
        sessions.leavePeer(peerId);
      } else if (msg.type === 'SIGNAL') {
        sessions.handleSignal(peerId, msg.targetPeerId, msg.payload);
      }
    });

    ws.on('close', () => {
      sessions.suspendPeer(peerId, ws);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return {
    wsUrl: `ws://127.0.0.1:${address.port}/ws`,
    close: async () => {
      wss.clients.forEach((c) => c.close());
      await new Promise<void>((resolve) => wss.close(() => server.close(() => resolve())));
    }
  };
}

class InMemoryPeerConnection {
  static peers = new Map<string, InMemoryPeerConnection>();
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'complete';
  signalingState: RTCSignalingState = 'stable';
  remoteDescription: RTCSessionDescription | null = null;
  sctp = { maxMessageSize: 262144 };
  onicecandidate: ((e: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((e: any) => void) | null = null;
  private localChannels = new Map<string, any>();
  private id = Math.random().toString(36).slice(2);

  constructor() {
    InMemoryPeerConnection.peers.set(this.id, this);
  }

  createDataChannel(label: string) {
    const ch: any = {
      label,
      readyState: 'connecting',
      bufferedAmount: 0,
      bufferedAmountLowThreshold: 0,
      binaryType: 'arraybuffer',
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close() { this.readyState = 'closed'; },
      send: (data: any) => {
        const remote = this.findRemoteChannel(label);
        remote?.onmessage?.({ data });
      }
    };
    this.localChannels.set(label, ch);
    return ch;
  }

  private findRemoteChannel(label: string) {
    for (const [id, pc] of InMemoryPeerConnection.peers) {
      if (id !== this.id) return pc.localChannels.get(label);
    }
    return undefined;
  }

  async createOffer() { return { type: 'offer' as const, sdp: `offer-${this.id}` }; }
  async createAnswer() { return { type: 'answer' as const, sdp: `answer-${this.id}` }; }
  async setLocalDescription(desc: RTCSessionDescriptionInit) {
    this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';
    queueMicrotask(() => {
      this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'candidate:1 1 udp 1 127.0.0.1 9999 typ host', sdpMid: '0', sdpMLineIndex: 0 }) } });
    });
  }
  async setRemoteDescription(desc: RTCSessionDescriptionInit) {
    this.remoteDescription = desc as RTCSessionDescription;
    if (desc.type === 'offer') {
      this.signalingState = 'have-remote-offer';
      for (const label of ['controlChannel', 'fileChannel']) {
        const remoteCh = this.createDataChannel(label);
        this.ondatachannel?.({ channel: remoteCh });
      }
    } else {
      this.signalingState = 'stable';
      queueMicrotask(() => {
        for (const pc of InMemoryPeerConnection.peers.values()) {
          pc.connectionState = 'connected';
          pc.iceConnectionState = 'connected';
          pc.localChannels.forEach((ch) => {
            ch.readyState = 'open';
            ch.onopen?.();
          });
          pc.onconnectionstatechange?.();
        }
      });
    }
  }
  async addIceCandidate(_c: RTCIceCandidateInit) {}
  close() {
    this.connectionState = 'closed';
    InMemoryPeerConnection.peers.delete(this.id);
  }
}

describe('End-to-End Session Creation & Peer Connection', () => {
  const cleanups: (() => Promise<void> | void)[] = [];

  afterEach(async () => {
    InMemoryPeerConnection.peers.clear();
    vi.unstubAllGlobals();
    while (cleanups.length > 0) {
      await cleanups.pop()?.();
    }
  });

  it('creates a session on Host, joins from another device, establishes P2P channels, and exchanges data', async () => {
    vi.stubGlobal('WebSocket', WebSocket);
    vi.stubGlobal('window', { location: { protocol: 'http:', hostname: 'localhost' } });
    vi.stubGlobal('RTCPeerConnection', InMemoryPeerConnection);
    vi.stubGlobal('RTCSessionDescription', class { constructor(public init: any) { Object.assign(this, init); } });
    vi.stubGlobal('RTCIceCandidate', class { constructor(public init: any) { Object.assign(this, init); } });

    const srv = await startTestSignalingServer();
    cleanups.push(srv.close);

    const hostSignaling = new SignalingClient(srv.wsUrl);
    const joinSignaling = new SignalingClient(srv.wsUrl);
    cleanups.push(() => hostSignaling.disconnect());
    cleanups.push(() => joinSignaling.disconnect());

    const hostReceivedText: string[] = [];
    const joinReceivedText: string[] = [];

    const hostRtc = new WebRTCManager(hostSignaling, {
      onTextMessage: (t) => hostReceivedText.push(t)
    });
    const joinRtc = new WebRTCManager(joinSignaling, {
      onTextMessage: (t) => joinReceivedText.push(t)
    });
    cleanups.push(() => hostRtc.close());
    cleanups.push(() => joinRtc.close());

    const hostConnected = new Promise<void>((resolve) => {
      hostRtc.setEvents({
        onStateChange: (s) => { if (s === 'connected') resolve(); }
      });
    });
    const joinConnected = new Promise<void>((resolve) => {
      joinRtc.setEvents({
        onStateChange: (s) => { if (s === 'connected') resolve(); }
      });
    });

    const sessionCode = await new Promise<string>((resolve) => {
      hostSignaling.on('SESSION_CREATED', (m) => resolve(m.sessionId!));
      hostSignaling.on('PEER_JOINED', (m) => {
        if (m.peerId) void hostRtc.initiateConnection(m.peerId);
      });
      hostSignaling.createSession();
    });

    expect(sessionCode).toMatch(/^\d{6}$/);

    const joined = new Promise<void>((resolve) => {
      joinSignaling.on('SESSION_JOINED', (m) => {
        if (m.targetPeerId) joinRtc.setTargetPeerId(m.targetPeerId);
        resolve();
      });
    });
    await joinSignaling.connect();
    joinSignaling.joinSession(sessionCode);

    await Promise.all([joined, hostConnected, joinConnected]);
    expect(hostRtc.areChannelsOpen()).toBe(true);
    expect(joinRtc.areChannelsOpen()).toBe(true);

    expect(hostRtc.sendTextMessage('Hello from Host')).toBe(true);
    expect(joinRtc.sendTextMessage('Hello from Joiner')).toBe(true);
    expect(joinReceivedText).toEqual(['Hello from Host']);
    expect(hostReceivedText).toEqual(['Hello from Joiner']);
  });
});
