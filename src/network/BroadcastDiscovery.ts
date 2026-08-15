/**
 * Local LAN / Same-Network Zero-Internet Discovery Adapter
 * Uses BroadcastChannel API to discover and announce peers locally on same-network/cross-tab.
 */

export interface LocalPeerAnnouncement {
  peerId: string;
  sessionId: string;
  timestamp: number;
  mode: 'host' | 'client';
}

export class BroadcastDiscovery {
  private channel: BroadcastChannel | null = null;
  private channelName: string = 'shree_p2p_local_mesh';
  private onPeerDiscovered?: (peer: LocalPeerAnnouncement) => void;
  private heartbeatTimer: any = null;

  constructor(onPeerDiscovered?: (peer: LocalPeerAnnouncement) => void) {
    this.onPeerDiscovered = onPeerDiscovered;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (event) => {
          if (event.data && event.data.type === 'LOCAL_PEER_ANNOUNCE') {
            if (this.onPeerDiscovered) {
              this.onPeerDiscovered(event.data.payload);
            }
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel not supported in this environment', err);
      }
    }
  }

  public announcePresence(peerId: string, sessionId: string, mode: 'host' | 'client') {
    if (!this.channel) return;

    const payload: LocalPeerAnnouncement = {
      peerId,
      sessionId,
      timestamp: Date.now(),
      mode
    };

    this.channel.postMessage({
      type: 'LOCAL_PEER_ANNOUNCE',
      payload
    });

    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.channel) {
        this.channel.postMessage({
          type: 'LOCAL_PEER_ANNOUNCE',
          payload: { ...payload, timestamp: Date.now() }
        });
      }
    }, 5000);
  }

  public stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}
