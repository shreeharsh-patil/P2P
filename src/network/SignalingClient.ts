import { SignalMessage, SignalType } from '../../server/signalingTypes.js';

export type SignalHandler = (msg: SignalMessage) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private handlers: Map<SignalType | 'ALL', Set<SignalHandler>> = new Map();
  private isConnected: boolean = false;
  private reconnectTimer: any = null;
  public peerId: string | null = null;
  public sessionId: string | null = null;
  public targetPeerId: string | null = null;

  constructor(serverUrl?: string) {
    const envUrl = import.meta.env.VITE_SIGNALING_URL;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname || 'localhost';
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.endsWith('.local');

    if (serverUrl) {
      this.serverUrl = serverUrl;
    } else if (envUrl) {
      this.serverUrl = envUrl;
    } else if (isLocal) {
      this.serverUrl = `${protocol}//${hostname}:4050/ws`;
    } else {
      // Direct production URL to user's Render backend
      this.serverUrl = `wss://p2p-9ewe.onrender.com/ws`;
    }
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log(`Connecting to signaling server: ${this.serverUrl}`);
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          console.log(`Signaling WebSocket CONNECTED: ${this.serverUrl}`);
          this.isConnected = true;
          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
          }
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const msg: SignalMessage = JSON.parse(event.data);
            if (msg.peerId && !this.peerId) {
              this.peerId = msg.peerId;
            }
            if (msg.sessionId) {
              this.sessionId = msg.sessionId;
            }
            if (msg.targetPeerId) {
              this.targetPeerId = msg.targetPeerId;
            }

            this.emit(msg.type, msg);
            this.emit('ALL', msg);
          } catch (e) {
            console.error('Error parsing WS message', e);
          }
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.scheduleReconnect();
        };

        this.ws.onerror = (err) => {
          console.error(`Signaling WebSocket connection attempt failed for ${this.serverUrl}`, err);
          if (!this.isConnected) {
            // Render free tier backend may be waking up from spin-down cold start; schedule retry
            this.scheduleReconnect();
            reject(err);
          }
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  public createSession(): void {
    this.send({ type: 'CREATE_SESSION' });
  }

  public joinSession(sessionId: string): void {
    this.send({ type: 'JOIN_SESSION', sessionId });
  }

  public sendSignal(targetPeerId: string, payload: any): void {
    this.send({
      type: 'SIGNAL',
      targetPeerId,
      payload
    });
  }

  private send(msg: SignalMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public on(type: SignalType | 'ALL', handler: SignalHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  public off(type: SignalType | 'ALL', handler: SignalHandler): void {
    if (this.handlers.has(type)) {
      this.handlers.get(type)!.delete(handler);
    }
  }

  private emit(type: SignalType | 'ALL', msg: SignalMessage): void {
    const list = this.handlers.get(type);
    if (list) {
      list.forEach((h) => h(msg));
    }
  }

  private scheduleReconnect(): void {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        console.log(`Re-attempting connection to signaling server: ${this.serverUrl}`);
        this.connect().catch(() => {});
      }, 2500);
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
