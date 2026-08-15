import { describe, it, expect } from 'vitest';
import { AdaptiveChunkController } from '../engine/AdaptiveChunkController';

describe('AdaptiveChunkController', () => {
  it('initializes with default config and scales up on consecutive fast drains', () => {
    const controller = new AdaptiveChunkController({
      initialChunkSize: 256 * 1024,
      minChunkSize: 64 * 1024,
      maxChunkSize: 1024 * 1024
    });

    expect(controller.getChunkSize()).toBe(256 * 1024);

    // Report 8 consecutive fast drains (<30ms)
    for (let i = 0; i < 8; i++) {
      controller.reportSuccess(10);
    }

    // Should have doubled to 512KB
    expect(controller.getChunkSize()).toBe(512 * 1024);
  });

  it('scales down when backpressure threshold is triggered', async () => {
    const controller = new AdaptiveChunkController({
      initialChunkSize: 512 * 1024,
      minChunkSize: 64 * 1024,
      maxChunkSize: 1024 * 1024
    });

    // Wait slightly to pass throttle window
    await new Promise((r) => setTimeout(r, 250));
    controller.reportBackpressure();

    // Should have halved from 512KB to 256KB
    expect(controller.getChunkSize()).toBe(256 * 1024);
  });
});
