import { describe, it, expect } from 'vitest';
import { ResumeManager } from '../engine/ResumeManager';

describe('WebRTC Chaos & Chunk Resume Engine', () => {
  it('correctly tracks non-contiguous received chunk bitsets and missing indices', async () => {
    const transferId = 'chaos-test-transfer';
    const totalChunks = 10;
    const resumeMgr = new ResumeManager(transferId, totalChunks);

    // Simulate arriving chunks out of order: 0, 2, 3, 5, 8
    await resumeMgr.markChunkReceived(0);
    await resumeMgr.markChunkReceived(2);
    await resumeMgr.markChunkReceived(3);
    await resumeMgr.markChunkReceived(5);
    await resumeMgr.markChunkReceived(8);

    expect(resumeMgr.isComplete()).toBe(false);
    expect(resumeMgr.getReceivedCount()).toBe(5);

    // First missing chunk should be 1
    expect(resumeMgr.getFirstMissingChunkIndex()).toBe(1);

    const missingList = resumeMgr.getMissingChunkIndices();
    expect(missingList).toEqual([1, 4, 6, 7, 9]);

    // Fill the remaining missing chunks
    for (const idx of missingList) {
      await resumeMgr.markChunkReceived(idx);
    }

    expect(resumeMgr.isComplete()).toBe(true);
    expect(resumeMgr.getReceivedCount()).toBe(10);
    expect(resumeMgr.getMissingChunkIndices()).toEqual([]);
  });
});
