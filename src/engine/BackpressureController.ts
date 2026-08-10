/**
 * BackpressureController prevents memory bloat by monitoring RTCDataChannel.bufferedAmount
 * and pausing chunk transmission whenever the send buffer is full.
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
    highWaterMark: number = 512 * 1024, // 512 KB
    lowWaterMark: number = 128 * 1024   // 128 KB
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

      // Safety timeout in case onbufferedamountlow doesn't fire
      const timeoutPromise = new Promise<void>((resolve) => {
        const interval = setInterval(() => {
          if (this.channel.bufferedAmount <= this.lowWaterMark) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
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
