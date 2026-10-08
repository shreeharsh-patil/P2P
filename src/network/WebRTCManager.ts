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
  private connectionTimer: any = null;
  private disconnectionTimer: any = null;
  private relayProbeTimer: any = null;

  public controlChannel: RTCDataChannel | null = null;
  public fileChannel: RTCDataChannel | null = null;
  public isWebSocketRelayMode: boolean = false;

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
    console.log(`[WebRTC] Target peer ID set to: ${peerId}`);
    this.targetPeerId = peerId;
    this.flushOutgoingIceCandidates();
  }

  public getDiagnostics(): string {
    return [
      `Initiator: ${this.isInitiator}`,
      `Target: ${this.targetPeerId || 'none'}`,
      `Relay Mode: ${this.isWebSocketRelayMode ? 'WebSocket Tunnel' : 'Direct P2P'}`,
      `Offer sent: ${this.offerSent}, received: ${this.offerReceived}`,
      `Answer sent: ${this.answerSent}, received: ${this.answerReceived}`,
      `ICE candidates sent: ${this.iceCandidatesSent}, received: ${this.iceCandidatesReceived}`,
      `Connection: ${this.peerConnection?.connectionState || 'none'}`,
      `ICE State: ${this.peerConnection?.iceConnectionState || 'none'}`,
      `Gathering State: ${this.peerConnection?.iceGatheringState || 'none'}`,
      `Signaling State: ${this.peerConnection?.signalingState || 'none'}`,
    ].join('\n');
  }

  private updateState(state: WebRTCState) {
    if (this.connectionState === state) return;
    this.connectionState = state;
    console.log(`[WebRTC] Connection state transition: ${state}`);

    if (state === 'connected') {
      if (this.connectionTimer) {
        clearTimeout(this.connectionTimer);
        this.connectionTimer = null;
      }
      if (this.disconnectionTimer) {
        clearTimeout(this.disconnectionTimer);
        this.disconnectionTimer = null;
      }
      if (this.relayProbeTimer) {
        clearTimeout(this.relayProbeTimer);
        this.relayProbeTimer = null;
      }
    }

    this.events.onStateChange?.(state);
  }

  private activateWebSocketRelayMode(reason: string) {
    if (this.isWebSocketRelayMode || !this.signaling.isOnline()) return;
    console.log(`[WebRTC] Fallback to WebSocket Relay Mode (${reason})`);
    this.isWebSocketRelayMode = true;
    this.updateState('connected');
    this.events.onChannelReady?.();
  }

  private setupSignalingListeners() {
    this.signaling.on('SIGNAL', async (msg) => {
      if (!msg.payload) return;
      const { type, sdp, candidate, isRelayData, isRelayProbe, isRelayAck, controlPayload, fileBufferArray } = msg.payload;
      if (msg.peerId && this.targetPeerId && msg.peerId !== this.targetPeerId) return;

      if (msg.peerId && !this.targetPeerId) {
        this.setTargetPeerId(msg.peerId);
      }

      if (isRelayProbe && msg.peerId) {
        if (this.signaling.sendSignal(msg.peerId, { isRelayAck: true })) {
          this.activateWebSocketRelayMode('peer-verified relay');
        }
        return;
      }
      if (isRelayAck) {
        this.activateWebSocketRelayMode('relay acknowledgment received');
        return;
      }
      if (type === 'restart-request' && this.isInitiator && msg.peerId) {
        void this.initiateConnection(msg.peerId).catch(console.error);
        return;
      }

      // Handle WebSocket Relay Data
      if (isRelayData) {
        this.activateWebSocketRelayMode('received relay payload');

        if (controlPayload && this.events.onControlMessage) {
          if (controlPayload.type === 'TEXT_MESSAGE' && controlPayload.textPayload && this.events.onTextMessage) {
            this.events.onTextMessage(controlPayload.textPayload, msg.peerId || 'Peer', controlPayload.timestamp || Date.now());
          } else {
            this.events.onControlMessage(controlPayload);
          }
        }

        if (fileBufferArray && this.events.onFileChunk) {
          const uint8 = new Uint8Array(fileBufferArray);
          this.events.onFileChunk(uint8.buffer);
        }
        return;
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
        console.error('[WebRTC] Error processing incoming signal:', e);
      }
    });
  }

  public async initiateConnection(targetPeerId: string): Promise<void> {
    console.log(`[WebRTC] Initiating WebRTC offer to target peer: ${targetPeerId}`);
    // Every fresh handshake needs a fresh PC; a failed PC cannot be reused.
    if (this.peerConnection) this.close();
    this.isInitiator = true;
    this.setTargetPeerId(targetPeerId);
    this.createPeerConnection();

    this.controlChannel = this.peerConnection!.createDataChannel('controlChannel', { ordered: true });
    this.fileChannel = this.peerConnection!.createDataChannel('fileChannel', { ordered: true });
    this.setupControlChannel(this.controlChannel);
    this.setupFileChannel(this.fileChannel);

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    console.log(`[WebRTC] Sending SDP offer to ${targetPeerId}`);
    this.signaling.sendSignal(targetPeerId, { type: 'offer', sdp: offer });
    this.offerSent = true;
    this.flushOutgoingIceCandidates();
    this.startConnectionTimeout();
  }

  private createPeerConnection() {
    if (this.peerConnection) return;

    // High-speed STUN + Metered OpenRelay TURN
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10
    };

    console.log(`[WebRTC] Initializing RTCPeerConnection...`);
    this.peerConnection = new RTCPeerConnection(config);
    const connection = this.peerConnection;
    this.updateState('connecting');

    this.peerConnection.onicecandidate = (event) => {
      if (this.peerConnection !== connection) return;
      if (event.candidate) {
        const json = event.candidate.toJSON();
        const target = this.targetPeerId;
        if (target && this.signaling.sendSignal(target, { candidate: json })) {
          this.iceCandidatesSent++;
        } else {
          this.pendingOutgoingIceCandidates.push(json);
        }
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection !== connection) return;
      const state = connection.connectionState;
      console.log(`[WebRTC] PeerConnection state changed: ${state}`);
      if (state === 'connected') {
        this.handleChannelReadiness();
      } else if (state === 'failed' || state === 'disconnected') {
        this.scheduleRelayFallback();
      } else if (state === 'closed') {
        this.updateState('closed');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      if (this.peerConnection !== connection) return;
      const iceState = connection.iceConnectionState;
      console.log(`[WebRTC] ICE state changed: ${iceState}`);
      if (iceState === 'connected' || iceState === 'completed') {
        this.handleChannelReadiness();
      } else if (iceState === 'failed' || iceState === 'disconnected') {
        this.scheduleRelayFallback();
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      if (this.peerConnection !== connection) return;
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

  private startConnectionTimeout() {
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    // Allow ICE/TURN enough time to negotiate before attempting a verified relay.
    this.connectionTimer = setTimeout(() => {
      if (this.connectionState !== 'connected') {
        console.log('[WebRTC] ICE timeout; probing available relay');
        this.probeRelay();
      }
    }, 25_000);
  }

  private handleChannelReadiness(): void {
    if (this.controlChannel?.readyState === 'open' &&
        this.fileChannel?.readyState === 'open') {
      this.isWebSocketRelayMode = false;
      if (this.connectionState !== 'connected') {
        this.updateState('connected');
        this.events.onChannelReady?.();
      }
    }
  }

  private probeRelay(): void {
    if (this.areChannelsOpen()) return;
    if (!this.targetPeerId || !this.signaling.isOnline()) {
      this.updateState('disconnected');
      return;
    }
    // Do not claim success until the remote peer acknowledges the relay.
    this.signaling.sendSignal(this.targetPeerId, { isRelayProbe: true });
    if (this.relayProbeTimer) clearTimeout(this.relayProbeTimer);
    this.relayProbeTimer = setTimeout(() => {
      this.relayProbeTimer = null;
      if (!this.areChannelsOpen()) this.updateState('failed');
    }, 10_000);
  }

  private scheduleRelayFallback() {
    if (this.disconnectionTimer || this.isWebSocketRelayMode) return;
    this.updateState('disconnected');
    this.disconnectionTimer = setTimeout(() => {
      this.disconnectionTimer = null;
      if (this.areChannelsOpen()) return;
      if (this.targetPeerId && this.signaling.isOnline()) {
        if (this.isInitiator) {
          void this.initiateConnection(this.targetPeerId).catch((error) =>
            console.warn('[WebRTC] Renegotiation failed', error));
        } else {
          this.signaling.sendSignal(this.targetPeerId, { type: 'restart-request' });
          this.startConnectionTimeout();
        }
      } else {
        this.probeRelay();
      }
    }, 12_000);
  }

  private flushOutgoingIceCandidates() {
    if (this.targetPeerId && this.signaling.isOnline() && this.pendingOutgoingIceCandidates.length > 0) {
      console.log(`[WebRTC] Flushing ${this.pendingOutgoingIceCandidates.length} buffered outgoing ICE candidates to ${this.targetPeerId}`);
      while (this.pendingOutgoingIceCandidates.length > 0) {
        const c = this.pendingOutgoingIceCandidates.shift();
        if (c) {
          if (this.signaling.sendSignal(this.targetPeerId, { candidate: c })) {
            this.iceCandidatesSent++;
          } else {
            this.pendingOutgoingIceCandidates.unshift(c);
            break;
          }
        }
      }
    }
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit, remotePeerId: string) {
    console.log(`[WebRTC] Handling SDP offer from ${remotePeerId}...`);
    if (this.peerConnection) this.close();
    this.isInitiator = false;
    this.setTargetPeerId(remotePeerId);
    this.createPeerConnection();

    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.processPendingIncomingIceCandidates();

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    console.log(`[WebRTC] Sending SDP answer to ${remotePeerId}`);
    this.signaling.sendSignal(remotePeerId, { type: 'answer', sdp: answer });
    this.answerSent = true;
    this.flushOutgoingIceCandidates();
    this.startConnectionTimeout();
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit) {
    console.log('[WebRTC] Handling SDP answer...');
    if (this.peerConnection?.signalingState === 'have-local-offer') {
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
        console.warn('[WebRTC] Error adding ICE candidate', e);
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
        console.warn('[WebRTC] Error processing buffered candidate', e);
      }
    }
  }

  private setupControlChannel(ch: RTCDataChannel) {
    const handleOpen = () => {
      console.log('[WebRTC] Control DataChannel OPEN');
      this.handleChannelReadiness();
    };

    ch.onopen = handleOpen;
    if (ch.readyState === 'open') {
      handleOpen();
    }

    ch.onmessage = (event) => {
      try {
        const msg: ControlMessage = JSON.parse(event.data);
        if (msg.type === 'TEXT_MESSAGE' && msg.textPayload) {
          this.events.onTextMessage?.(msg.textPayload, this.targetPeerId || 'Peer', msg.timestamp || Date.now());
        } else {
          this.events.onControlMessage?.(msg);
        }
      } catch (e) {
        console.error('[WebRTC] Control message error', e);
      }
    };

    ch.onerror = (e) => console.error('[WebRTC] Control channel error', e);
  }

  private setupFileChannel(ch: RTCDataChannel) {
    ch.binaryType = 'arraybuffer';

    const handleOpen = () => {
      console.log('[WebRTC] File DataChannel OPEN');
      this.handleChannelReadiness();
    };

    ch.onopen = handleOpen;
    if (ch.readyState === 'open') {
      handleOpen();
    }

    ch.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.events.onFileChunk?.(event.data);
      }
    };

    ch.onerror = (e) => console.error('[WebRTC] File channel error', e);
  }

  public sendControlMessage(msg: ControlMessage): boolean {
    if (this.isWebSocketRelayMode && this.targetPeerId) {
      return this.signaling.sendSignal(this.targetPeerId, {
        isRelayData: true,
        controlPayload: msg
      });
    }
    if (this.controlChannel?.readyState === 'open') {
      try {
        this.controlChannel.send(JSON.stringify(msg));
        return true;
      } catch (error) {
        console.warn('[WebRTC] Control channel send failed', error);
      }
    }
    return false;
  }

  public sendFileChunk(buffer: ArrayBuffer): boolean {
    if (this.isWebSocketRelayMode && this.targetPeerId) {
      return this.signaling.sendSignal(this.targetPeerId, {
        isRelayData: true,
        fileBufferArray: Array.from(new Uint8Array(buffer))
      });
    }
    if (this.fileChannel?.readyState === 'open') {
      try {
        this.fileChannel.send(buffer);
        return true;
      } catch (error) {
        console.warn('[WebRTC] File channel send failed', error);
      }
    }
    return false;
  }

  public sendTextMessage(text: string): boolean {
    return this.sendControlMessage({ type: 'TEXT_MESSAGE', textPayload: text, timestamp: Date.now() });
  }

  public areChannelsOpen(): boolean {
    return (this.controlChannel?.readyState === 'open' &&
            this.fileChannel?.readyState === 'open') ||
      (this.isWebSocketRelayMode && this.signaling.isOnline());
  }

  public close(): void {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
    if (this.disconnectionTimer) {
      clearTimeout(this.disconnectionTimer);
      this.disconnectionTimer = null;
    }
    if (this.relayProbeTimer) {
      clearTimeout(this.relayProbeTimer);
      this.relayProbeTimer = null;
    }
    this.controlChannel?.close();
    this.fileChannel?.close();
    this.peerConnection?.close();
    this.controlChannel = null;
    this.fileChannel = null;
    this.peerConnection = null;
    this.pendingIncomingIceCandidates = [];
    this.pendingOutgoingIceCandidates = [];
    this.targetPeerId = null;
    this.isWebSocketRelayMode = false;
    this.iceCandidatesSent = 0;
    this.iceCandidatesReceived = 0;
    this.offerSent = false;
    this.answerSent = false;
    this.offerReceived = false;
    this.answerReceived = false;
    this.updateState('closed');
  }
}
