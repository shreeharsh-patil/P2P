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
    if (serverUrl) {
      this.serverUrl = serverUrl;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const hostname = window.location.hostname || 'localhost';
      // Dynamically target port 4050 on current hostname (works for localhost & local network IPs)
      this.serverUrl = `${protocol}//${hostname}:4050/ws`;
    }
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        let wsUrl = this.serverUrl;

        this.ws = new WebSocket(wsUrl);

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
          console.error('Signaling WebSocket error', err);
          if (!this.isConnected) {
            // Fallback attempt via relative Vite proxy /ws if direct 4050 failed
            if (wsUrl.includes(':4050/ws')) {
              const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
              const proxyUrl = `${protocol}//${window.location.host}/ws`;
              console.log('Retrying signaling connection via proxy:', proxyUrl);
              try {
                const proxyWs = new WebSocket(proxyUrl);
                proxyWs.onopen = () => {
                  this.ws = proxyWs;
                  this.isConnected = true;
                  resolve();
                };
                proxyWs.onerror = (pErr) => reject(pErr);
                return;
              } catch (e) {}
            }
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
