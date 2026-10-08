import { SignalMessage, SignalType } from '../../server/signalingTypes.js';

export type SignalHandler = (msg: SignalMessage) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private handlers = new Map<SignalType | 'ALL', Set<SignalHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectPromise: Promise<void> | null = null;
  private shouldReconnect = true;
  private retries = 0;
  private sendQueue: SignalMessage[] = [];
  private statusListener: ((connected: boolean) => void) | null = null;
  private resumeToken: string | null = null;
  private awaitingResume = false;
  public peerId: string | null = null;
  public sessionId: string | null = null;
  public targetPeerId: string | null = null;

  constructor(serverUrl?: string) {
    const envUrl = import.meta.env.VITE_SIGNALING_URL;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname || 'localhost';
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
      hostname.endsWith('.local');
    this.serverUrl = serverUrl || envUrl || (isLocal
      ? `${protocol}//${hostname}:4050/ws`
      : 'wss://p2p-9ewe.onrender.com/ws');
  }

  public isOnline(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public onConnectionChange(listener: (connected: boolean) => void): void {
    this.statusListener = listener;
    listener(this.isOnline());
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  public connect(): Promise<void> {
    if (this.isOnline()) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.shouldReconnect = true;
    this.clearReconnectTimer();

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let socket: WebSocket;
      try {
        socket = new WebSocket(this.serverUrl);
        this.ws = socket;
      } catch (error) {
        this.connectPromise = null;
        this.scheduleReconnect();
        reject(error);
        return;
      }

      let settled = false;
      const rejectOnce = (error: Error) => {
        if (settled) return;
        settled = true;
        this.connectPromise = null;
        reject(error);
      };

      socket.onopen = () => {
        if (this.ws !== socket) return;
        settled = true;
        this.connectPromise = null;
        this.retries = 0;
        this.clearReconnectTimer();
        this.startHeartbeat(socket);
        this.statusListener?.(true);
        resolve();
        if (this.sessionId && this.resumeToken) {
          this.awaitingResume = true;
          socket.send(JSON.stringify({
            type: 'RESUME_SESSION',
            sessionId: this.sessionId,
            resumeToken: this.resumeToken
          }));
        } else {
          this.flushQueue(socket);
        }
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        try {
          const msg: SignalMessage = JSON.parse(event.data);
          if (msg.type === 'WELCOME' || msg.type === 'SESSION_RESUMED' ||
              msg.type === 'SESSION_CREATED' || msg.type === 'SESSION_JOINED') {
            if (msg.peerId) this.peerId = msg.peerId;
          }
          if (msg.sessionId) this.sessionId = msg.sessionId;
          if (msg.targetPeerId) this.targetPeerId = msg.targetPeerId;
          if ((msg.type === 'SESSION_CREATED' || msg.type === 'SESSION_JOINED' ||
               msg.type === 'SESSION_RESUMED') && msg.resumeToken) {
            this.resumeToken = msg.resumeToken;
          }
          if (msg.type === 'SESSION_RESUMED') {
            this.awaitingResume = false;
            this.flushQueue(socket);
          }
          if (msg.type === 'ERROR' && this.awaitingResume) {
            this.awaitingResume = false;
            this.resumeToken = null;
            this.sessionId = null;
            this.targetPeerId = null;
            this.sendQueue = [];
          }
          this.emit(msg.type, msg);
          this.emit('ALL', msg);
        } catch (error) {
          console.error('[Signaling] Invalid incoming message', error);
        }
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
        this.ws = null;
        this.awaitingResume = false;
        this.stopHeartbeat();
        this.statusListener?.(false);
        rejectOnce(new Error('Signaling connection closed before it was established'));
        this.scheduleReconnect();
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        console.warn('[Signaling] WebSocket error; scheduling reconnect');
        if (socket.readyState === WebSocket.CONNECTING) socket.close();
        this.scheduleReconnect();
        rejectOnce(new Error('Signaling connection failed'));
      };
    });
    return this.connectPromise;
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectTimer || this.isOnline()) return;
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.retries++, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null; // Clear before retry, including when it fails.
      if (this.shouldReconnect) void this.connect().catch(() => {});
    }, delay);
  }

  private flushQueue(socket: WebSocket): void {
    while (this.sendQueue.length > 0 && this.ws === socket &&
           socket.readyState === WebSocket.OPEN) {
      const message = this.sendQueue.shift()!;
      socket.send(JSON.stringify(message));
    }
  }

  private send(message: SignalMessage): boolean {
    if (this.isOnline() && !this.awaitingResume) {
      try {
        this.ws!.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.warn('[Signaling] Send failed', error);
      }
    }
    // SDP and ICE messages cannot be replayed after a socket/session reset.
    // Only buffer session management requests, never file data or stale offers.
    if (message.type === 'CREATE_SESSION' || message.type === 'JOIN_SESSION') {
      this.sendQueue = [message];
    }
    if (!this.isOnline() && !this.reconnectTimer && !this.connectPromise) {
      void this.connect().catch(() => {});
    }
    return false;
  }

  public createSession(): void {
    this.leaveSession();
    this.send({ type: 'CREATE_SESSION' });
  }

  public joinSession(sessionId: string): void {
    this.leaveSession();
    this.send({ type: 'JOIN_SESSION', sessionId });
  }

  public sendSignal(targetPeerId: string, payload: unknown): boolean {
    return this.send({ type: 'SIGNAL', targetPeerId, payload });
  }

  public leaveSession(): void {
    // Explicitly free the old room; a transport disconnect only suspends it.
    if (this.isOnline()) this.ws!.send(JSON.stringify({ type: 'LEAVE_SESSION' }));
    this.sessionId = null;
    this.resumeToken = null;
    this.targetPeerId = null;
    this.awaitingResume = false;
    this.sendQueue = [];
  }

  public on(type: SignalType | 'ALL', handler: SignalHandler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
  }

  public off(type: SignalType | 'ALL', handler: SignalHandler): void {
    this.handlers.get(type)?.delete(handler);
  }

  private emit(type: SignalType | 'ALL', msg: SignalMessage): void {
    this.handlers.get(type)?.forEach((handler) => handler(msg));
  }

  private startHeartbeat(socket: WebSocket): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws === socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'PING' }));
      }
    }, 20_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.connectPromise = null;
    this.statusListener = null;
    const socket = this.ws;
    this.ws = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  }
}
