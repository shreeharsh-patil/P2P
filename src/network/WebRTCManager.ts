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

  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private events: WebRTCEvents = {};
  public connectionState: WebRTCState = 'new';
  public isInitiator: boolean = false;

  private rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
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

      if (!this.targetPeerId && msg.peerId) {
        this.targetPeerId = msg.peerId;
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
    this.targetPeerId = targetPeerId;
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
  }

  private createPeerConnection() {
    if (this.peerConnection) return;

    this.peerConnection = new RTCPeerConnection(this.rtcConfig);
    this.updateState('connecting');

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.targetPeerId) {
        this.signaling.sendSignal(this.targetPeerId, {
          candidate: event.candidate.toJSON()
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        const state = this.peerConnection.connectionState as WebRTCState;
        this.updateState(state);
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

  private async handleOffer(sdp: RTCSessionDescriptionInit, remotePeerId: string) {
    this.isInitiator = false;
    this.targetPeerId = remotePeerId;
    this.createPeerConnection();

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(sdp));
    this.processPendingIceCandidates();

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    this.signaling.sendSignal(remotePeerId, {
      type: 'answer',
      sdp: answer
    });
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      this.processPendingIceCandidates();
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      this.pendingIceCandidates.push(candidate);
    }
  }

  private async processPendingIceCandidates() {
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      while (this.pendingIceCandidates.length > 0) {
        const candidate = this.pendingIceCandidates.shift();
        if (candidate) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
    }
  }

  private setupControlChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      console.log('Control DataChannel OPEN');
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

  /**
   * True only when both data channels are actually open and usable.
   * The UI gates uploads on this so offers are never sent over a closed channel.
   */
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
