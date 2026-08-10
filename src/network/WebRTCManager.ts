import { SignalingClient } from './SignalingClient.js';
import { ControlMessage } from '../engine/types.js';

export type WebRTCState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface WebRTCEvents {
  onStateChange?: (state: WebRTCState) => void;
  onControlMessage?: (msg: ControlMessage) => void;
  onFileChunk?: (buffer: ArrayBuffer) => void;
  onTextMessage?: (text: string, senderId: string, timestamp: number) => void;
  onChannelReady?: () => void;
}

// Fetch ICE servers (STUN + TURN) from the signaling backend.
// Falls back to Google STUN only if the server is unreachable.
async function fetchIceServers(): Promise<RTCIceServer[]> {
  const signalingBase = import.meta.env.VITE_SIGNALING_URL
    ? import.meta.env.VITE_SIGNALING_URL.replace(/^wss?:\/\//, 'https://').replace('/ws', '')
    : (() => {
        const hostname = window.location.hostname;
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
        return isLocal
          ? `http://${hostname}:4050`
          : 'https://p2p-9ewe.onrender.com';
      })();

  try {
    const res = await fetch(`${signalingBase}/api/ice-servers`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log('[WebRTC] Fetched ICE servers from backend:', data.iceServers?.length);
    return data.iceServers;
  } catch (e) {
    console.warn('[WebRTC] Could not fetch ICE servers from backend, using fallback STUN', e);
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ];
  }
}

export class WebRTCManager {
  private peerConnection: RTCPeerConnection | null = null;
  private signaling: SignalingClient;
  private targetPeerId: string | null = null;

  public controlChannel: RTCDataChannel | null = null;
  public fileChannel: RTCDataChannel | null = null;

  private pendingIncomingIceCandidates: RTCIceCandidateInit[] = [];
  private pendingOutgoingIceCandidates: RTCIceCandidateInit[] = [];
  private events: WebRTCEvents = {};
  public connectionState: WebRTCState = 'new';
  public isInitiator: boolean = false;
  private iceServers: RTCIceServer[] = [];

  constructor(signaling: SignalingClient, events: WebRTCEvents = {}) {
    this.signaling = signaling;
    this.events = events;
    this.setupSignalingListeners();
    // Pre-fetch ICE servers in the background so they're ready when needed
    fetchIceServers().then(servers => { this.iceServers = servers; });
  }

  public setEvents(events: WebRTCEvents) {
    this.events = { ...this.events, ...events };
  }

  public setTargetPeerId(peerId: string) {
    this.targetPeerId = peerId;
    this.flushOutgoingIceCandidates();
  }

  private updateState(state: WebRTCState) {
    if (this.connectionState === state) return;
    this.connectionState = state;
    console.log(`[WebRTC] State → ${state}`);
    this.events.onStateChange?.(state);
  }

  private setupSignalingListeners() {
    this.signaling.on('SIGNAL', async (msg) => {
      if (!msg.payload) return;
      const { type, sdp, candidate } = msg.payload;

      if (msg.peerId && !this.targetPeerId) {
        this.setTargetPeerId(msg.peerId);
      }

      if (type === 'offer') {
        await this.handleOffer(sdp, msg.peerId!);
      } else if (type === 'answer') {
        await this.handleAnswer(sdp);
      } else if (candidate) {
        await this.handleIceCandidate(candidate);
      }
    });
  }

  public async initiateConnection(targetPeerId: string): Promise<void> {
    this.isInitiator = true;
    this.setTargetPeerId(targetPeerId);

    // Ensure ICE servers are loaded before creating offer
    if (this.iceServers.length === 0) {
      this.iceServers = await fetchIceServers();
    }

    this.createPeerConnection();

    this.controlChannel = this.peerConnection!.createDataChannel('controlChannel', { ordered: true });
    this.fileChannel = this.peerConnection!.createDataChannel('fileChannel', { ordered: true });
    this.setupControlChannel(this.controlChannel);
    this.setupFileChannel(this.fileChannel);

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    this.signaling.sendSignal(targetPeerId, { type: 'offer', sdp: offer });
    this.flushOutgoingIceCandidates();
  }

  private createPeerConnection() {
    if (this.peerConnection) return;

    const config: RTCConfiguration = {
      iceServers: this.iceServers.length > 0 ? this.iceServers : [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443?transport=tcp'],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10
    };

    console.log(`[WebRTC] Creating PeerConnection with ${config.iceServers?.length} ICE servers`);
    this.peerConnection = new RTCPeerConnection(config);
    this.updateState('connecting');

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const json = event.candidate.toJSON();
        const target = this.targetPeerId || this.signaling.targetPeerId;
        if (target) {
          this.signaling.sendSignal(target, { candidate: json });
        } else {
          this.pendingOutgoingIceCandidates.push(json);
        }
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log(`[WebRTC] PeerConnection: ${state}`);
      if (state === 'connected') {
        this.updateState('connected');
      } else if (state === 'failed') {
        this.updateState('failed');
      } else if (state === 'disconnected') {
        this.updateState('disconnected');
      } else if (state === 'closed') {
        this.updateState('closed');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE: ${this.peerConnection?.iceConnectionState}`);
    };

    this.peerConnection.onicegatheringstatechange = () => {
      console.log(`[WebRTC] Gathering: ${this.peerConnection?.iceGatheringState}`);
    };

    this.peerConnection.ondatachannel = (event) => {
      const ch = event.channel;
      console.log(`[WebRTC] DataChannel received: ${ch.label}`);
      if (ch.label === 'controlChannel') {
        this.controlChannel = ch;
        this.setupControlChannel(ch);
      } else if (ch.label === 'fileChannel') {
        this.fileChannel = ch;
        this.setupFileChannel(ch);
      }
    };
  }

  private flushOutgoingIceCandidates() {
    const target = this.targetPeerId || this.signaling.targetPeerId;
    if (target && this.pendingOutgoingIceCandidates.length > 0) {
      console.log(`[WebRTC] Flushing ${this.pendingOutgoingIceCandidates.length} buffered ICE candidates`);
      while (this.pendingOutgoingIceCandidates.length > 0) {
        const c = this.pendingOutgoingIceCandidates.shift();
        if (c) this.signaling.sendSignal(target, { candidate: c });
      }
    }
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit, remotePeerId: string) {
    console.log('[WebRTC] Handling offer...');
    this.isInitiator = false;
    this.setTargetPeerId(remotePeerId);

    if (this.iceServers.length === 0) {
      this.iceServers = await fetchIceServers();
    }

    this.createPeerConnection();
    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.processPendingIncomingIceCandidates();

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    this.signaling.sendSignal(remotePeerId, { type: 'answer', sdp: answer });
    this.flushOutgoingIceCandidates();
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit) {
    console.log('[WebRTC] Handling answer...');
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.processPendingIncomingIceCandidates();
      this.flushOutgoingIceCandidates();
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (this.peerConnection?.remoteDescription) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[WebRTC] Failed to add ICE candidate', e);
      }
    } else {
      this.pendingIncomingIceCandidates.push(candidate);
    }
  }

  private async processPendingIncomingIceCandidates() {
    if (!this.peerConnection?.remoteDescription) return;
    const pending = [...this.pendingIncomingIceCandidates];
    this.pendingIncomingIceCandidates = [];
    for (const c of pending) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('[WebRTC] Failed to add buffered ICE candidate', e);
      }
    }
  }

  private setupControlChannel(ch: RTCDataChannel) {
    ch.onopen = () => {
      console.log('[WebRTC] Control channel OPEN');
      this.updateState('connected');
      this.events.onChannelReady?.();
    };
    ch.onmessage = (event) => {
      try {
        const msg: ControlMessage = JSON.parse(event.data);
        if (msg.type === 'TEXT_MESSAGE' && msg.textPayload) {
          this.events.onTextMessage?.(msg.textPayload, this.targetPeerId || 'Peer', msg.timestamp || Date.now());
        } else {
          this.events.onControlMessage?.(msg);
        }
      } catch (e) {
        console.error('[WebRTC] Control message parse error', e);
      }
    };
    ch.onerror = (e) => console.error('[WebRTC] Control channel error', e);
  }

  private setupFileChannel(ch: RTCDataChannel) {
    ch.binaryType = 'arraybuffer';
    ch.onopen = () => {
      console.log('[WebRTC] File channel OPEN');
      this.updateState('connected');
    };
    ch.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.events.onFileChunk?.(event.data);
      }
    };
    ch.onerror = (e) => console.error('[WebRTC] File channel error', e);
  }

  public sendControlMessage(msg: ControlMessage): boolean {
    if (this.controlChannel?.readyState === 'open') {
      this.controlChannel.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  public sendTextMessage(text: string): boolean {
    return this.sendControlMessage({ type: 'TEXT_MESSAGE', textPayload: text, timestamp: Date.now() });
  }

  public areChannelsOpen(): boolean {
    return this.controlChannel?.readyState === 'open' && this.fileChannel?.readyState === 'open';
  }

  public close(): void {
    this.controlChannel?.close();
    this.fileChannel?.close();
    this.peerConnection?.close();
    this.controlChannel = null;
    this.fileChannel = null;
    this.peerConnection = null;
    this.pendingIncomingIceCandidates = [];
    this.pendingOutgoingIceCandidates = [];
    this.targetPeerId = null;
    this.updateState('closed');
  }
}
