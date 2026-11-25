import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackpressureController } from '../engine/BackpressureController';
import { WebRTCManager } from '../network/WebRTCManager';
import { SignalingClient } from '../network/SignalingClient';

class FakeDataChannel {
  readyState: RTCDataChannelState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  binaryType: BinaryType = 'arraybuffer';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onbufferedamountlow: (() => void) | null = null;
  private listeners = new Map<string, Set<() => void>>();
  sent: any[] = [];

  addEventListener(type: string, cb: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: () => void) {
    this.listeners.get(type)?.delete(cb);
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((cb) => cb());
    if (type === 'bufferedamountlow') this.onbufferedamountlow?.();
  }
  send(data: any) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 'closed';
    this.onclose?.();
  }
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'new';
  signalingState: RTCSignalingState = 'stable';
  remoteDescription: RTCSessionDescription | null = null;
  sctp: { maxMessageSize: number } | null = { maxMessageSize: 262144 };
  onicecandidate: ((e: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((e: any) => void) | null = null;
  channels: FakeDataChannel[] = [];

  createDataChannel(_label: string) {
    const ch = new FakeDataChannel();
    this.channels.push(ch);
    return ch as unknown as RTCDataChannel;
  }
  async createOffer() { return { type: 'offer', sdp: 'v=0' } as RTCSessionDescriptionInit; }
  async createAnswer() { return { type: 'answer', sdp: 'v=0' } as RTCSessionDescriptionInit; }
  async setLocalDescription(_desc: RTCSessionDescriptionInit) {}
  async setRemoteDescription(_desc: RTCSessionDescriptionInit) {}
  async addIceCandidate(_c: RTCIceCandidateInit) {}
  close() { this.connectionState = 'closed'; }
}

describe('Connection Stability & Transfer Optimizations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('clears polling interval cleanly when BackpressureController drains via event', async () => {
    const channel = new FakeDataChannel();
    channel.bufferedAmount = 5 * 1024 * 1024;
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');

    const controller = new BackpressureController(
      channel as unknown as RTCDataChannel,
      4 * 1024 * 1024,
      1 * 1024 * 1024
    );

    const waitPromise = controller.waitIfBuffered();
    channel.bufferedAmount = 512 * 1024;
    channel.emit('bufferedamountlow');
    await waitPromise;

    expect(clearSpy).toHaveBeenCalled();
    controller.destroy();
  });

  it('absorbs transient WebRTC disconnected states without dropping active connection', async () => {
    const FakePC = FakePeerConnection;
    vi.stubGlobal('RTCPeerConnection', FakePC);
    vi.stubGlobal('RTCSessionDescription', class { constructor(public init: any) {} });

    const handlers = new Map<string, Set<(msg: any) => void>>();
    const mockSignaling: any = {
      isOnline: () => true,
      getBufferedAmount: () => 0,
      sendSignal: vi.fn(() => true),
      on: (type: string, cb: (msg: any) => void) => {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(cb);
      }
    };

    const states: string[] = [];
    const rtc = new WebRTCManager(mockSignaling, {
      onStateChange: (s) => states.push(s)
    });

    await rtc.initiateConnection('peer-2');
    const pc = (rtc as any).peerConnection as FakePeerConnection;
    pc.connectionState = 'connected';
    pc.onconnectionstatechange?.();
    expect(rtc.connectionState).toBe('connected');
    expect(rtc.getOptimalChunkSize()).toBe(224 * 1024);

    // Transient 1s ICE glitch followed by recovery must not fire 'disconnected'
    pc.connectionState = 'disconnected';
    pc.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(rtc.connectionState).toBe('connected');

    pc.connectionState = 'connected';
    pc.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(3000);
    expect(states).toEqual(['connecting', 'connected']);
    rtc.close();
  });

  it('round-trips binary chunks over WebSocket relay using compact Base64', () => {
    const handlers = new Map<string, Set<(msg: any) => void>>();
    const sentPayloads: any[] = [];
    const mockSignaling: any = {
      isOnline: () => true,
      getBufferedAmount: () => 0,
      sendSignal: vi.fn((_target: string, payload: any) => {
        sentPayloads.push(payload);
        return true;
      }),
      on: (type: string, cb: (msg: any) => void) => {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(cb);
      }
    };

    const received: ArrayBuffer[] = [];
    const rtc = new WebRTCManager(mockSignaling, {
      onFileChunk: (buf) => received.push(buf)
    });

    const emitSignal = (payload: any) => {
      handlers.get('SIGNAL')?.forEach((fn) => fn({ type: 'SIGNAL', peerId: 'peer-2', payload }));
    };

    emitSignal({ isRelayAck: true });
    expect(rtc.isWebSocketRelayMode).toBe(true);
    expect(rtc.getOptimalChunkSize()).toBe(60 * 1024);

    const sample = new Uint8Array([0x53, 0x48, 0x52, 0x45, 1, 2, 254, 255]);
    expect(rtc.sendFileChunk(sample.buffer)).toBe(true);
    expect(typeof sentPayloads[0].fileBufferBase64).toBe('string');
    expect(sentPayloads[0].fileBufferArray).toBeUndefined();

    emitSignal({ isRelayData: true, fileBufferBase64: sentPayloads[0].fileBufferBase64 });
    expect(received).toHaveLength(1);
    expect(Array.from(new Uint8Array(received[0]))).toEqual(Array.from(sample));
    rtc.close();
  });

  it('closes zombie signaling socket when heartbeat pong times out', async () => {
    class FakeWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 3;
      static sockets: FakeWebSocket[] = [];
      readyState = FakeWebSocket.CONNECTING;
      bufferedAmount = 0;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      sent: any[] = [];
      constructor(_url: string) { FakeWebSocket.sockets.push(this); }
      open() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
      close() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.(); }
      send(data: string) { this.sent.push(JSON.parse(data)); }
    }

    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('window', { location: { protocol: 'http:', hostname: 'localhost' } });

    const client = new SignalingClient('ws://local/ws');
    const p = client.connect();
    FakeWebSocket.sockets[0].open();
    await p;

    // Advance past 35s without any incoming server messages -> should close zombie socket and reconnect
    await vi.advanceTimersByTimeAsync(46_000);
    expect(FakeWebSocket.sockets.length).toBeGreaterThanOrEqual(2);
    client.disconnect();
  });
});
