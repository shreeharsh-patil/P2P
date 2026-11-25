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
  private drainPromise: Promise<void> | null = null;
  private resolveDrain: (() => void) | null = null;
  private drainTimer: ReturnType<typeof setInterval> | null = null;
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
  public isBuffered(): boolean {
    return this.channel.readyState === 'open' &&
      (this.drainPromise !== null || this.channel.bufferedAmount >= this.highWaterMark);
  }

  public waitIfBuffered(): Promise<void> {
    if (!this.isBuffered()) return Promise.resolve();
    if (!this.drainPromise) {
      this.drainPromise = new Promise<void>((resolve) => {
        this.resolveDrain = resolve;
      });
      // One poll also covers browsers that miss the bufferedamountlow event.
      this.drainTimer = setInterval(() => this.checkDrain(), 10);
    }
    return this.drainPromise;
  }

  public destroy(): void {
    if (typeof this.channel.removeEventListener === 'function') {
      this.channel.removeEventListener('bufferedamountlow', this.onLowHandler);
    } else if (this.channel.onbufferedamountlow === this.onLowHandler) {
      this.channel.onbufferedamountlow = null;
    }
    this.finishDrain();
  }

  private checkDrain() {
    if (this.channel.readyState !== 'open' || this.channel.bufferedAmount <= this.lowWaterMark) {
      this.finishDrain();
    }
  }

  private finishDrain(): void {
    if (this.drainTimer !== null) clearInterval(this.drainTimer);
    this.drainTimer = null;
    const resolve = this.resolveDrain;
    this.resolveDrain = null;
    this.drainPromise = null;
    resolve?.();
  }
}
