/**
 * AdaptiveChunkController dynamically tunes DataChannel chunk sizes
 * based on measured network throughput, buffer drain latency, and backpressure frequency.
 */

export interface AdaptiveChunkConfig {
  minChunkSize?: number;      // default: 64 KB
  maxChunkSize?: number;      // default: 2 MB
  initialChunkSize?: number;  // default: 512 KB
}

export class AdaptiveChunkController {
  private currentChunkSize: number;
  private minChunkSize: number;
  private maxChunkSize: number;

  private consecutiveFastChunks: number = 0;
  private backpressureHits: number = 0;
  private lastAdjustTime: number = Date.now();

  constructor(config: AdaptiveChunkConfig = {}) {
    this.minChunkSize = config.minChunkSize || 64 * 1024;
    this.maxChunkSize = config.maxChunkSize || 2 * 1024 * 1024;
    this.currentChunkSize = config.initialChunkSize || 512 * 1024;
  }

  public getChunkSize(): number {
    return this.currentChunkSize;
  }

  /**
   * Called when a chunk is sent and buffer drained quickly without pausing.
   */
  public reportSuccess(drainTimeMs: number) {
    // If buffer drained smoothly in under 30ms
    if (drainTimeMs < 30) {
      this.consecutiveFastChunks += 1;
      if (this.consecutiveFastChunks >= 8) {
        this.scaleUp();
        this.consecutiveFastChunks = 0;
      }
    } else {
      this.consecutiveFastChunks = 0;
    }
  }

  /**
   * Called when DataChannel buffer hit high watermark and forced a pause.
   */
  public reportBackpressure() {
    this.backpressureHits += 1;
    this.consecutiveFastChunks = 0;

    const now = Date.now();
    if (now - this.lastAdjustTime > 200) {
      this.scaleDown();
      this.lastAdjustTime = now;
      this.backpressureHits = 0;
    }
  }

  private scaleUp() {
    if (this.currentChunkSize < this.maxChunkSize) {
      const nextSize = Math.min(this.maxChunkSize, this.currentChunkSize * 2);
      this.currentChunkSize = nextSize;
    }
  }

  private scaleDown() {
    if (this.currentChunkSize > this.minChunkSize) {
      const nextSize = Math.max(this.minChunkSize, Math.floor(this.currentChunkSize / 2));
      this.currentChunkSize = nextSize;
    }
  }
}
