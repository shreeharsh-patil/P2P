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

  // Diagnostic counters
  private iceCandidatesSent = 0;
  private iceCandidatesReceived = 0;
  private offerSent = false;
  private answerSent = false;
  private offerReceived = false;
  private answerReceived = false;

  constructor(signaling: SignalingClient, events: WebRTCEvents = {}) {
    this.signaling = signaling;
    this.events = events;
    this.setupSignalingListeners();
  }

  public setEvents(events: WebRTCEvents) {
    this.events = { ...this.events, ...events };
  }

  public setTargetPeerId(peerId: string) {
    console.log(`[WebRTC] targetPeerId set to: ${peerId}`);
    this.targetPeerId = peerId;
    this.flushOutgoingIceCandidates();
  }

  public getDiagnostics(): string {
    return [
      `Initiator: ${this.isInitiator}`,
      `Target: ${this.targetPeerId || 'none'}`,
      `Offer sent: ${this.offerSent}, received: ${this.offerReceived}`,
      `Answer sent: ${this.answerSent}, received: ${this.answerReceived}`,
      `ICE candidates sent: ${this.iceCandidatesSent}, received: ${this.iceCandidatesReceived}`,
      `Connection: ${this.peerConnection?.connectionState || 'none'}`,
      `ICE: ${this.peerConnection?.iceConnectionState || 'none'}`,
      `Gathering: ${this.peerConnection?.iceGatheringState || 'none'}`,
      `Signaling: ${this.peerConnection?.signalingState || 'none'}`,
    ].join('\n');
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

      console.log(`[WebRTC] SIGNAL received: ${type ? `type=${type}` : ''}${candidate ? 'ICE candidate' : ''} from peerId=${msg.peerId}`);

      // Learn the remote peer's ID from the first signal we receive
      if (msg.peerId && !this.targetPeerId) {
        this.setTargetPeerId(msg.peerId);
      }

      try {
        if (type === 'offer' && sdp) {
          this.offerReceived = true;
          await this.handleOffer(sdp, msg.peerId!);
        } else if (type === 'answer' && sdp) {
          this.answerReceived = true;
          await this.handleAnswer(sdp);
        } else if (candidate) {
          this.iceCandidatesReceived++;
          await this.handleIceCandidate(candidate);
        }
      } catch (e) {
        console.error('[WebRTC] Error handling signal:', e);
      }
    });
  }

  public async initiateConnection(targetPeerId: string): Promise<void> {
    console.log(`[WebRTC] initiateConnection to ${targetPeerId}`);
    this.isInitiator = true;
    this.setTargetPeerId(targetPeerId);
    this.createPeerConnection();

    this.controlChannel = this.peerConnection!.createDataChannel('controlChannel', { ordered: true });
    this.fileChannel = this.peerConnection!.createDataChannel('fileChannel', { ordered: true });
    this.setupControlChannel(this.controlChannel);
    this.setupFileChannel(this.fileChannel);

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    console.log(`[WebRTC] Sending offer to ${targetPeerId}`);
    this.signaling.sendSignal(targetPeerId, { type: 'offer', sdp: offer });
    this.offerSent = true;
    this.flushOutgoingIceCandidates();
  }

  private createPeerConnection() {
    if (this.peerConnection) return;

    // Hardcoded reliable ICE servers — no dynamic fetch, no failure points
    const config: RTCConfiguration = {
      iceServers: [
        // Google STUN (most reliable)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        // Cloudflare STUN
        { urls: 'stun:stun.cloudflare.com:3478' },
        // OpenRelay TURN — free public relay by metered.ca
        // Supports UDP (port 80), TLS (port 443), TCP fallback
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turns:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
      ],
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
    };

    console.log(`[WebRTC] Creating PeerConnection with ${config.iceServers!.length} ICE server entries`);
    this.peerConnection = new RTCPeerConnection(config);
    this.updateState('connecting');

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const json = event.candidate.toJSON();
        const target = this.targetPeerId;
        if (target) {
          this.signaling.sendSignal(target, { candidate: json });
          this.iceCandidatesSent++;
        } else {
          console.warn('[WebRTC] ICE candidate generated but no targetPeerId — buffering');
          this.pendingOutgoingIceCandidates.push(json);
        }
      } else {
        console.log(`[WebRTC] ICE gathering complete. Sent ${this.iceCandidatesSent} candidates total.`);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log(`[WebRTC] PeerConnection state: ${state}`);
      if (state === 'connected') {
        this.updateState('connected');
      } else if (state === 'failed') {
        console.error('[WebRTC] CONNECTION FAILED. Diagnostics:\n' + this.getDiagnostics());
        this.updateState('failed');
      } else if (state === 'disconnected') {
        this.updateState('disconnected');
      } else if (state === 'closed') {
        this.updateState('closed');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection?.iceConnectionState;
      console.log(`[WebRTC] ICE connection: ${iceState}`);
      // Some browsers don't fire onconnectionstatechange but do fire this
      if (iceState === 'connected' || iceState === 'completed') {
        this.updateState('connected');
      } else if (iceState === 'failed') {
        console.error('[WebRTC] ICE FAILED. Diagnostics:\n' + this.getDiagnostics());
        this.updateState('failed');
      }
    };

    this.peerConnection.onicegatheringstatechange = () => {
      console.log(`[WebRTC] ICE gathering: ${this.peerConnection?.iceGatheringState}`);
    };

    this.peerConnection.ondatachannel = (event) => {
      const ch = event.channel;
      console.log(`[WebRTC] Remote DataChannel received: ${ch.label}`);
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
    if (this.targetPeerId && this.pendingOutgoingIceCandidates.length > 0) {
      console.log(`[WebRTC] Flushing ${this.pendingOutgoingIceCandidates.length} buffered ICE candidates to ${this.targetPeerId}`);
      while (this.pendingOutgoingIceCandidates.length > 0) {
        const c = this.pendingOutgoingIceCandidates.shift();
        if (c) {
          this.signaling.sendSignal(this.targetPeerId, { candidate: c });
          this.iceCandidatesSent++;
        }
      }
    }
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit, remotePeerId: string) {
    console.log(`[WebRTC] Processing offer from ${remotePeerId}`);
    this.isInitiator = false;
    this.setTargetPeerId(remotePeerId);
    this.createPeerConnection();

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[WebRTC] Remote description (offer) set');
    await this.processPendingIncomingIceCandidates();

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    console.log(`[WebRTC] Sending answer to ${remotePeerId}`);
    this.signaling.sendSignal(remotePeerId, { type: 'answer', sdp: answer });
    this.answerSent = true;
    this.flushOutgoingIceCandidates();
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit) {
    console.log('[WebRTC] Processing answer');
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      console.log('[WebRTC] Remote description (answer) set');
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
    if (pending.length > 0) {
      console.log(`[WebRTC] Processing ${pending.length} buffered incoming ICE candidates`);
    }
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
      console.log('[WebRTC] ✅ Control channel OPEN');
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
      console.log('[WebRTC] ✅ File channel OPEN');
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
    this.iceCandidatesSent = 0;
    this.iceCandidatesReceived = 0;
    this.offerSent = false;
    this.answerSent = false;
    this.offerReceived = false;
    this.answerReceived = false;
    this.updateState('closed');
  }
}
