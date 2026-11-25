import { afterEach, describe, it, expect, vi } from 'vitest';
import { StorageAdapter } from '../engine/StorageAdapter';
import { TransferManager } from '../engine/TransferManager';
import { TransferProtocol } from '../engine/TransferProtocol';
import type { ControlMessage, TransferItem } from '../engine/types';
import type { WebRTCEvents, WebRTCManager } from '../network/WebRTCManager';

describe('TransferManager Auto-Accept', () => {
  let manager: TransferManager | undefined;

  afterEach(() => {
    manager?.destroy();
    manager = undefined;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('toggles autoAccept flag correctly', () => {
    const mockRtc: any = {
      setEvents: vi.fn(),
      sendControlMessage: vi.fn(),
      sendFileChunk: vi.fn(),
      areChannelsOpen: () => true
    };

    manager = new TransferManager(mockRtc);
    expect(manager.isAutoAccept()).toBe(false);

    manager.setAutoAccept(true);
    expect(manager.isAutoAccept()).toBe(true);

    manager.setAutoAccept(false);
    expect(manager.isAutoAccept()).toBe(false);
  });

  function setupAcceptance() {
    vi.useFakeTimers();
    let events: WebRTCEvents = {};
    const rtc = {
      setEvents: (handlers: WebRTCEvents) => { events = handlers; },
      areChannelsOpen: vi.fn(() => false),
      sendControlMessage: vi.fn((_message: ControlMessage) => true)
    };
    const writer = {
      writeChunk: vi.fn(async () => {}),
      close: vi.fn(async () => new Blob(['abc'], { type: 'text/plain' })),
      abort: vi.fn(async () => {})
    };
    const createWriter = vi.spyOn(StorageAdapter, 'createWriter').mockResolvedValue({
      writer, strategy: 'opfs'
    });
    const onError = vi.fn();
    const transfer = new TransferManager(rtc as unknown as WebRTCManager, { onError });
    manager = transfer;
    transfer.setAutoAccept(true);

    const offer: ControlMessage = {
      type: 'FILE_OFFER',
      transferId: 'accept-test',
      meta: { id: 'accept-test', name: 'sample.txt', size: 3, type: 'text/plain', totalChunks: 1, chunkSize: 1024 }
    };
    events.onControlMessage?.(offer);
    return { transfer, rtc, writer, createWriter, onError, events, offer };
  }

  it('waits for both channels and retries a failed acceptance without reopening storage', async () => {
    const { transfer, rtc, writer, createWriter, onError, events, offer } = setupAcceptance();
    await vi.advanceTimersByTimeAsync(0);
    expect(transfer.getQueue()[0].status).toBe('queued');
    expect(rtc.sendControlMessage).not.toHaveBeenCalled();

    rtc.areChannelsOpen.mockReturnValue(true);
    rtc.sendControlMessage.mockReturnValueOnce(false);
    events.onChannelReady?.();
    expect(transfer.getQueue()[0].status).toBe('queued');

    events.onControlMessage?.(offer);
    await transfer.acceptOffer('accept-test');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(rtc.sendControlMessage).toHaveBeenCalledTimes(2);
    expect(rtc.sendControlMessage).toHaveBeenLastCalledWith({
      type: 'FILE_ACCEPT', transferId: 'accept-test', receivedIndex: 0
    });
    expect(transfer.getQueue()[0].status).toBe('transferring');
    expect(createWriter).toHaveBeenCalledTimes(1);
    expect(writer.abort).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    const payload = new TextEncoder().encode('abc');
    const completed = await new Promise<TransferItem>((resolve) => {
      transfer.setCallbacks({ onTransferCompleted: resolve });
      events.onFileChunk?.(TransferProtocol.encodePacket('accept-test', 0, 0n, payload.buffer));
    });

    expect(writer.writeChunk).toHaveBeenCalledWith(0, 0n, payload);
    expect(completed).toMatchObject({ status: 'completed', verified: true });
    URL.revokeObjectURL(completed.downloadUrl!);
  });

  it('discards pending acceptance when the session ends', async () => {
    const { transfer, rtc, writer, onError, events } = setupAcceptance();
    await vi.advanceTimersByTimeAsync(0);

    transfer.resetSession();
    rtc.areChannelsOpen.mockReturnValue(true);
    events.onChannelReady?.();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(transfer.getQueue()).toEqual([]);
    expect(writer.abort).toHaveBeenCalledTimes(1);
    expect(rtc.sendControlMessage).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a timeout and releases storage if the connection never recovers', async () => {
    const { transfer, rtc, writer, onError } = setupAcceptance();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(transfer.getQueue()[0].status).toBe('error');
    expect(writer.abort).toHaveBeenCalledTimes(1);
    expect(rtc.sendControlMessage).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
