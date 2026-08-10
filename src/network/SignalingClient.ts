import { SignalMessage, SignalType } from '../../server/signalingTypes.js';

export type SignalHandler = (msg: SignalMessage) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private fallbackUrls: string[] = [];
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
      this.fallbackUrls = [
        `${protocol}//${window.location.host}/ws`,
        `wss://shree-signaling.onrender.com/ws`
      ];
    } else {
      // Hosted on Vercel or cloud platform: default to dedicated cloud signaling server
      this.serverUrl = `wss://shree-signaling.onrender.com/ws`;
      this.fallbackUrls = [
        `wss://p2p-signaling-server.onrender.com/ws`,
        `${protocol}//${hostname}:4050/ws`
      ];
    }
  }

  public connect(urlIndex: number = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const targetUrl = urlIndex === 0 ? this.serverUrl : this.fallbackUrls[urlIndex - 1];
        if (!targetUrl) {
          reject(new Error('All signaling connection endpoints exhausted'));
          return;
        }

        console.log(`Connecting to signaling server (${urlIndex}): ${targetUrl}`);
        this.ws = new WebSocket(targetUrl);

        this.ws.onopen = () => {
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
          console.error(`Signaling WebSocket error for ${targetUrl}`, err);
          if (!this.isConnected) {
            if (urlIndex < this.fallbackUrls.length) {
              console.log(`Attempting fallback signaling URL #${urlIndex + 1}...`);
              this.connect(urlIndex + 1).then(resolve).catch(reject);
            } else {
              reject(err);
            }
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
        console.log('Attempting signaling reconnect...');
        this.connect().catch(() => {});
      }, 3000);
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
