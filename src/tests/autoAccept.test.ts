import { describe, it, expect, vi } from 'vitest';
import { TransferManager } from '../engine/TransferManager';

describe('TransferManager Auto-Accept', () => {
  it('toggles autoAccept flag correctly', () => {
    const mockRtc: any = {
      setEvents: vi.fn(),
      sendControlMessage: vi.fn(),
      sendFileChunk: vi.fn(),
      areChannelsOpen: () => true
    };

    const manager = new TransferManager(mockRtc);
    expect(manager.isAutoAccept()).toBe(false);

    manager.setAutoAccept(true);
    expect(manager.isAutoAccept()).toBe(true);

    manager.setAutoAccept(false);
    expect(manager.isAutoAccept()).toBe(false);
  });
});
