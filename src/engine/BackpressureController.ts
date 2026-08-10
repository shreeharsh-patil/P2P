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

  constructor(
    channel: RTCDataChannel,
    highWaterMark: number = 8 * 1024 * 1024, // 8 MB high water mark for Gbps streaming
    lowWaterMark: number = 2 * 1024 * 1024   // 2 MB low water mark
  ) {
    this.channel = channel;
    this.highWaterMark = highWaterMark;
    this.lowWaterMark = lowWaterMark;

    // Configure browser data channel low threshold
    try {
      this.channel.bufferedAmountLowThreshold = this.lowWaterMark;
    } catch (e) {
      console.warn('bufferedAmountLowThreshold not supported by browser', e);
    }

    this.channel.onbufferedamountlow = () => {
      this.checkDrain();
    };
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
    if (this.channel.bufferedAmount >= this.highWaterMark) {
      if (!this.isPaused) {
        this.isPaused = true;
        this.drainPromise = new Promise<void>((resolve) => {
          this.resolveDrain = resolve;
        });
      }

      // Safety polling fallback in case onbufferedamountlow is delayed
      const timeoutPromise = new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (this.channel.bufferedAmount <= this.lowWaterMark) {
            clearInterval(interval);
            resolve();
          }
        }, 15);
      });

      await Promise.race([this.drainPromise, timeoutPromise]);
      this.isPaused = false;
      this.drainPromise = null;
      this.resolveDrain = null;
    }
  }

  private checkDrain() {
    if (this.channel.bufferedAmount <= this.lowWaterMark && this.resolveDrain) {
      this.resolveDrain();
      this.resolveDrain = null;
    }
  }
}
