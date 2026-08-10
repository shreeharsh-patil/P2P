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

  // ICE configuration with STUN + free public TURN relay servers
  // TURN servers ensure connection works even behind symmetric NAT / mobile networks
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      // Google STUN
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      // Cloudflare STUN
      { urls: 'stun:stun.cloudflare.com:3478' },
      // Free OpenRelay TURN servers (UDP + TCP fallback)
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      // Free Metered TURN
      {
        urls: 'turn:a.relay.metered.ca:80',
        username: 'e499486ca705bdb96c9c6f98',
        credential: 'IbJHFVBBg/eoWjQP'
      },
      {
        urls: 'turn:a.relay.metered.ca:80?transport=tcp',
        username: 'e499486ca705bdb96c9c6f98',
        credential: 'IbJHFVBBg/eoWjQP'
      },
      {
        urls: 'turn:a.relay.metered.ca:443',
        username: 'e499486ca705bdb96c9c6f98',
        credential: 'IbJHFVBBg/eoWjQP'
      },
      {
        urls: 'turn:a.relay.metered.ca:443?transport=tcp',
        username: 'e499486ca705bdb96c9c6f98',
        credential: 'IbJHFVBBg/eoWjQP'
      }
    ],
    iceCandidatePoolSize: 10
  };

  constructor(signaling: SignalingClient, events: WebRTCEvents = {}) {
    this.signaling = signaling;
    this.events = events;
    this.setupSignalingListeners();
  }

  public setEvents(events: WebRTCEvents) {
    this.events = { ...this.events, ...events };
  }

  public setTargetPeerId(targetPeerId: string) {
    this.targetPeerId = targetPeerId;
    this.flushOutgoingIceCandidates();
  }

  private updateState(state: WebRTCState) {
    if (this.connectionState === state) return; // avoid duplicate events
    this.connectionState = state;
    console.log(`[WebRTC] State → ${state}`);
    if (this.events.onStateChange) {
      this.events.onStateChange(state);
    }
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
    this.createPeerConnection();

    // Host creates both DataChannels
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

    this.peerConnection = new RTCPeerConnection(this.rtcConfig);
    this.updateState('connecting');

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        const candidateJson = event.candidate.toJSON();
        const target = this.targetPeerId || this.signaling.targetPeerId;
        if (target) {
          this.signaling.sendSignal(target, { candidate: candidateJson });
        } else {
          this.pendingOutgoingIceCandidates.push(candidateJson);
        }
      }
    };

    // PRIMARY: peerConnection state drives our connected state
    this.peerConnection.onconnectionstatechange = () => {
      const pc = this.peerConnection;
      if (!pc) return;
      const state = pc.connectionState;
      console.log(`[WebRTC] PeerConnection state: ${state}`);

      if (state === 'connected') {
        // Peer connection layer is up — set connected immediately
        this.updateState('connected');
      } else if (state === 'failed') {
        console.warn('[WebRTC] Connection failed — attempting ICE restart');
        this.updateState('failed');
        // Try ICE restart if we're the initiator
        if (this.isInitiator && this.targetPeerId) {
          this.iceRestart();
        }
      } else if (state === 'disconnected') {
        this.updateState('disconnected');
      } else if (state === 'closed') {
        this.updateState('closed');
      }
    };

    // ICE connection state for additional diagnostics
    this.peerConnection.oniceconnectionstatechange = () => {
      const pc = this.peerConnection;
      if (!pc) return;
      console.log(`[WebRTC] ICE connection state: ${pc.iceConnectionState}`);
    };

    // ICE gathering state
    this.peerConnection.onicegatheringstatechange = () => {
      const pc = this.peerConnection;
      if (!pc) return;
      console.log(`[WebRTC] ICE gathering state: ${pc.iceGatheringState}`);
    };

    // Client receives channels from host
    this.peerConnection.ondatachannel = (event) => {
      const channel = event.channel;
      console.log(`[WebRTC] DataChannel received: ${channel.label}`);
      if (channel.label === 'controlChannel') {
        this.controlChannel = channel;
        this.setupControlChannel(channel);
      } else if (channel.label === 'fileChannel') {
        this.fileChannel = channel;
        this.setupFileChannel(channel);
      }
    };
  }

  private async iceRestart() {
    if (!this.peerConnection || !this.targetPeerId) return;
    try {
      console.log('[WebRTC] ICE restart initiated');
      const offer = await this.peerConnection.createOffer({ iceRestart: true });
      await this.peerConnection.setLocalDescription(offer);
      this.signaling.sendSignal(this.targetPeerId, { type: 'offer', sdp: offer });
    } catch (e) {
      console.error('[WebRTC] ICE restart failed', e);
    }
  }

  private flushOutgoingIceCandidates() {
    const target = this.targetPeerId || this.signaling.targetPeerId;
    if (target && this.pendingOutgoingIceCandidates.length > 0) {
      console.log(`[WebRTC] Flushing ${this.pendingOutgoingIceCandidates.length} buffered ICE candidates`);
      while (this.pendingOutgoingIceCandidates.length > 0) {
        const candidate = this.pendingOutgoingIceCandidates.shift();
        if (candidate) {
          this.signaling.sendSignal(target, { candidate });
        }
      }
    }
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit, remotePeerId: string) {
    console.log('[WebRTC] Received offer, creating answer...');
    this.isInitiator = false;
    this.setTargetPeerId(remotePeerId);
    this.createPeerConnection();

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(sdp));
    this.processPendingIncomingIceCandidates();

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    this.signaling.sendSignal(remotePeerId, { type: 'answer', sdp: answer });
    this.flushOutgoingIceCandidates();
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit) {
    console.log('[WebRTC] Received answer, setting remote description...');
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      this.processPendingIncomingIceCandidates();
      this.flushOutgoingIceCandidates();
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (this.peerConnection && this.peerConnection.remoteDescription) {
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
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      const pending = [...this.pendingIncomingIceCandidates];
      this.pendingIncomingIceCandidates = [];
      for (const candidate of pending) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC] Failed to add buffered ICE candidate', e);
        }
      }
    }
  }

  private setupControlChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log('[WebRTC] Control DataChannel OPEN');
      if (this.events.onChannelReady) this.events.onChannelReady();
      // Ensure state is marked connected when channels open (belt + suspenders)
      this.updateState('connected');
    };

    channel.onmessage = (event) => {
      try {
        const msg: ControlMessage = JSON.parse(event.data);
        if (msg.type === 'TEXT_MESSAGE' && msg.textPayload && this.events.onTextMessage) {
          this.events.onTextMessage(msg.textPayload, this.targetPeerId || 'Peer', msg.timestamp || Date.now());
        } else if (this.events.onControlMessage) {
          this.events.onControlMessage(msg);
        }
      } catch (e) {
        console.error('[WebRTC] Error parsing control message', e);
      }
    };

    channel.onerror = (e) => console.error('[WebRTC] Control channel error', e);
  }

  private setupFileChannel(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      console.log('[WebRTC] File DataChannel OPEN');
      this.updateState('connected');
    };

    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer && this.events.onFileChunk) {
        this.events.onFileChunk(event.data);
      }
    };

    channel.onerror = (e) => console.error('[WebRTC] File channel error', e);
  }

  public sendControlMessage(msg: ControlMessage): boolean {
    if (this.controlChannel && this.controlChannel.readyState === 'open') {
      this.controlChannel.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  public sendTextMessage(text: string): boolean {
    return this.sendControlMessage({
      type: 'TEXT_MESSAGE',
      textPayload: text,
      timestamp: Date.now()
    });
  }

  public areChannelsOpen(): boolean {
    return !!this.controlChannel && this.controlChannel.readyState === 'open'
      && !!this.fileChannel && this.fileChannel.readyState === 'open';
  }

  public close(): void {
    if (this.controlChannel) { this.controlChannel.close(); this.controlChannel = null; }
    if (this.fileChannel) { this.fileChannel.close(); this.fileChannel = null; }
    if (this.peerConnection) { this.peerConnection.close(); this.peerConnection = null; }
    this.pendingIncomingIceCandidates = [];
    this.pendingOutgoingIceCandidates = [];
    this.targetPeerId = null;
    this.updateState('closed');
  }
}
