/**
 * BackpressureController prevents memory bloat by monitoring RTCDataChannel.bufferedAmount
 * and pausing chunk transmission whenever the send buffer is full.
 *
 * Tuned for Multi-Gigabit (Gbps) WebRTC throughput on LAN / Wi-Fi 6 / 5G.
 */
export class BackpressureController {
  private channel: RTCDataChannel;
  private highWaterMark: number;
  private lowWaterMark: number;
  private isPaused: boolean = false;
  private drainPromise: Promise<void> | null = null;
  private resolveDrain: (() => void) | null = null;
  private onLowHandler: () => void;

  constructor(
    channel: RTCDataChannel,
    highWaterMark: number = 4 * 1024 * 1024, // 4 MB high water mark for full-speed WebRTC streaming
    lowWaterMark: number = 1 * 1024 * 1024   // 1 MB low water mark
  ) {
    this.channel = channel;
    this.highWaterMark = highWaterMark;
    this.lowWaterMark = lowWaterMark;

    try {
      this.channel.bufferedAmountLowThreshold = this.lowWaterMark;
    } catch (e) {
      console.warn('bufferedAmountLowThreshold not supported by browser', e);
    }

    this.onLowHandler = () => {
      this.checkDrain();
    };
    if (typeof this.channel.addEventListener === 'function') {
      this.channel.addEventListener('bufferedamountlow', this.onLowHandler);
    } else {
      this.channel.onbufferedamountlow = this.onLowHandler;
    }
  }

  public setThresholds(highWater: number, lowWater: number) {
    this.highWaterMark = highWater;
    this.lowWaterMark = lowWater;
    try {
      this.channel.bufferedAmountLowThreshold = this.lowWaterMark;
    } catch (e) {}
  }

  /**
   * Called before sending a chunk. If buffer is too high, awaits until bufferedAmount drops.
   */
  public async waitIfBuffered(): Promise<void> {
    if (this.channel.readyState !== 'open') return;
    if (this.channel.bufferedAmount >= this.highWaterMark) {
      if (!this.isPaused) {
        this.isPaused = true;
        this.drainPromise = new Promise<void>((resolve) => {
          this.resolveDrain = resolve;
        });
      }

      let interval: ReturnType<typeof setInterval> | null = null;
      const timeoutPromise = new Promise<void>((resolve) => {
        interval = setInterval(() => {
          if (this.channel.readyState !== 'open' || this.channel.bufferedAmount <= this.lowWaterMark) {
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
            resolve();
          }
        }, 10);
      });

      try {
        await Promise.race([this.drainPromise, timeoutPromise]);
      } finally {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        this.isPaused = false;
        this.drainPromise = null;
        this.resolveDrain = null;
      }
    }
  }

  public destroy(): void {
    if (typeof this.channel.removeEventListener === 'function') {
      this.channel.removeEventListener('bufferedamountlow', this.onLowHandler);
    }
    this.resolveDrain?.();
    this.resolveDrain = null;
    this.drainPromise = null;
    this.isPaused = false;
  }

  private checkDrain() {
    if ((this.channel.readyState !== 'open' || this.channel.bufferedAmount <= this.lowWaterMark) && this.resolveDrain) {
      this.resolveDrain();
      this.resolveDrain = null;
    }
  }
}
