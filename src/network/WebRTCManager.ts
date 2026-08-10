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

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.cloudflare.com:3478' }
    ]
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
    this.connectionState = state;
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

    // Host creates controlChannel and fileChannel
    this.controlChannel = this.peerConnection!.createDataChannel('controlChannel', { ordered: true });
    this.fileChannel = this.peerConnection!.createDataChannel('fileChannel', { ordered: true });

    this.setupControlChannel(this.controlChannel);
    this.setupFileChannel(this.fileChannel);

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    this.signaling.sendSignal(targetPeerId, {
      type: 'offer',
      sdp: offer
    });

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

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        const state = this.peerConnection.connectionState as WebRTCState;
        this.updateState(state);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      if (this.peerConnection) {
        const iceState = this.peerConnection.iceConnectionState;
        if (iceState === 'connected' || iceState === 'completed') {
          this.checkChannelStates();
        } else if (iceState === 'failed' || iceState === 'disconnected') {
          this.updateState(iceState === 'failed' ? 'failed' : 'disconnected');
        }
      }
    };

    // Client receives incoming data channels created by Host
    this.peerConnection.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === 'controlChannel') {
        this.controlChannel = channel;
        this.setupControlChannel(channel);
      } else if (channel.label === 'fileChannel') {
        this.fileChannel = channel;
        this.setupFileChannel(channel);
      }
    };
  }

  private flushOutgoingIceCandidates() {
    const target = this.targetPeerId || this.signaling.targetPeerId;
    if (target && this.pendingOutgoingIceCandidates.length > 0) {
      while (this.pendingOutgoingIceCandidates.length > 0) {
        const candidate = this.pendingOutgoingIceCandidates.shift();
        if (candidate) {
          this.signaling.sendSignal(target, { candidate });
        }
      }
    }
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit, remotePeerId: string) {
    this.isInitiator = false;
    this.setTargetPeerId(remotePeerId);
    this.createPeerConnection();

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(sdp));
    this.processPendingIncomingIceCandidates();

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    this.signaling.sendSignal(remotePeerId, {
      type: 'answer',
      sdp: answer
    });

    this.flushOutgoingIceCandidates();
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit) {
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
        console.error('Error adding ICE candidate', e);
      }
    } else {
      this.pendingIncomingIceCandidates.push(candidate);
    }
  }

  private async processPendingIncomingIceCandidates() {
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      while (this.pendingIncomingIceCandidates.length > 0) {
        const candidate = this.pendingIncomingIceCandidates.shift();
        if (candidate) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('Error adding buffered ICE candidate', e);
          }
        }
      }
    }
  }

  private checkChannelStates() {
    if (
      this.controlChannel && this.controlChannel.readyState === 'open' &&
      this.fileChannel && this.fileChannel.readyState === 'open'
    ) {
      this.updateState('connected');
    }
  }

  private setupControlChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log('Control DataChannel OPEN');
      this.checkChannelStates();
      if (this.events.onChannelReady) this.events.onChannelReady();
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
        console.error('Error parsing control message', e);
      }
    };
  }

  private setupFileChannel(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      console.log('File DataChannel OPEN');
      this.checkChannelStates();
    };

    channel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer && this.events.onFileChunk) {
        this.events.onFileChunk(event.data);
      }
    };
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
    if (this.controlChannel) {
      this.controlChannel.close();
      this.controlChannel = null;
    }
    if (this.fileChannel) {
      this.fileChannel.close();
      this.fileChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.updateState('closed');
  }
}
