import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntegrityManager } from '../engine/IntegrityManager';
import { StorageAdapter } from '../engine/StorageAdapter';
import { TransferManager } from '../engine/TransferManager';
import { TransferProtocol } from '../engine/TransferProtocol';
import type { ControlMessage } from '../engine/types';
import type { WebRTCEvents, WebRTCManager } from '../network/WebRTCManager';

function makePeer() {
  const events: WebRTCEvents = {};
  const rtc = {
    setEvents: (handlers: WebRTCEvents) => Object.assign(events, handlers),
    areChannelsOpen: vi.fn(() => true),
    sendControlMessage: vi.fn((_message: ControlMessage) => true),
    sendFileChunk: vi.fn((_packet: ArrayBuffer) => true),
    fileChannel: null,
    isWebSocketRelayMode: false,
  };
  const manager = new TransferManager(rtc as unknown as WebRTCManager);
  manager.setAutoAccept(true);
  manager.setChunkSize(3);
  return { events, rtc, manager };
}

describe('File transfer recovery', () => {
  let sender: ReturnType<typeof makePeer>;
  let receiver: ReturnType<typeof makePeer>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(IntegrityManager, 'calculateFileHash').mockResolvedValue('test-hash');
    vi.spyOn(StorageAdapter, 'createWriter').mockImplementation(async () => {
      const chunks: BlobPart[] = [];
      return {
        strategy: 'indexeddb',
        writer: {
          async writeChunk(index, _offset, data) { chunks[index] = new Uint8Array(data); },
          async close(_name, type) { return new Blob(chunks, { type }); },
          async abort() { chunks.length = 0; },
        }
      };
    });
    sender = makePeer();
    receiver = makePeer();
    sender.rtc.sendControlMessage.mockImplementation((message) => {
      receiver.events.onControlMessage?.(message);
      return true;
    });
    receiver.rtc.sendControlMessage.mockImplementation((message) => {
      sender.events.onControlMessage?.(message);
      return true;
    });
    sender.rtc.sendFileChunk.mockImplementation((packet) => {
      receiver.events.onFileChunk?.(packet);
      return true;
    });
  });

  afterEach(() => {
    for (const item of receiver.manager.getQueue()) {
      if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
    }
    sender.manager.destroy();
    receiver.manager.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('delivers every file in a batch even if the first offer and receipt are lost', async () => {
    sender.rtc.sendControlMessage.mockReturnValueOnce(true);
    let lostReceipt = false;
    receiver.rtc.sendControlMessage.mockImplementation((message) => {
      if (message.type === 'VERIFICATION_RESULT' && !lostReceipt) {
        lostReceipt = true;
      } else {
        sender.events.onControlMessage?.(message);
      }
      return true;
    });

    const entries = ['first', 'second', 'third', 'fourth'].map((name) => ({
      file: new File([name], `${name}.txt`, { type: 'text/plain' }),
      relativePath: `folder/${name}.txt`,
    }));
    await sender.manager.offerFiles(entries, 'batch');
    await vi.advanceTimersByTimeAsync(15_000);

    expect(lostReceipt).toBe(true);
    expect(sender.manager.getQueue().map((item) => item.status)).toEqual(Array(4).fill('completed'));
    const received = receiver.manager.getQueue().sort((a, b) => a.name.localeCompare(b.name));
    expect(received.map((item) => item.relativePath)).toEqual(entries.map((entry) => entry.relativePath).sort());
    expect(await Promise.all(received.map((item) => item.downloadBlob!.text()))).toEqual(['first', 'fourth', 'second', 'third']);
  });

  it('starts after sender reconnection and requests a missing chunk before completing', async () => {
    receiver.rtc.sendControlMessage.mockImplementationOnce((message) => {
      sender.rtc.areChannelsOpen.mockReturnValue(false);
      sender.events.onControlMessage?.(message);
      return true;
    });
    let lostChunk = false;
    sender.rtc.sendFileChunk.mockImplementation((packet) => {
      const { chunkIndex } = TransferProtocol.decodePacket(packet);
      if (chunkIndex === 1 && !lostChunk) {
        lostChunk = true;
      } else {
        receiver.events.onFileChunk?.(packet);
      }
      return true;
    });

    const id = await sender.manager.offerFile(new File(['abcdefghi'], 'recovery.txt'));
    await vi.advanceTimersByTimeAsync(0);
    expect(sender.rtc.sendFileChunk).not.toHaveBeenCalled();

    sender.rtc.areChannelsOpen.mockReturnValue(true);
    sender.events.onChannelReady?.();
    await vi.advanceTimersByTimeAsync(12_000);

    expect(receiver.rtc.sendControlMessage).toHaveBeenCalledWith({ type: 'RESUME_REQ', transferId: id, receivedIndex: 1 });
    expect(sender.manager.getQueue()[0]).toMatchObject({ status: 'completed', verified: true });
    expect(await receiver.manager.getQueue()[0].downloadBlob!.text()).toBe('abcdefghi');
  });

  it('keeps in-flight chunks received after pausing', async () => {
    const delayedPackets: ArrayBuffer[] = [];
    sender.rtc.sendFileChunk.mockImplementation((packet) => {
      delayedPackets.push(packet);
      return true;
    });

    const id = await sender.manager.offerFile(new File(['abcdefghi'], 'paused.txt'));
    await vi.advanceTimersByTimeAsync(0);
    expect(delayedPackets).toHaveLength(3);

    receiver.manager.pauseTransfer(id);
    receiver.events.onFileChunk?.(delayedPackets[0]);
    await vi.advanceTimersByTimeAsync(0);

    expect(receiver.manager.getQueue()[0]).toMatchObject({ status: 'paused', progress: { chunksTransferred: 1 } });
    receiver.manager.resumeTransfer(id);
    expect(receiver.rtc.sendControlMessage).toHaveBeenCalledWith({ type: 'RESUME_TRANSFER', transferId: id, receivedIndex: 1 });
  });

  it('keeps a file read failure visible alongside successful files', async () => {
    vi.mocked(IntegrityManager.calculateFileHash).mockRejectedValueOnce(new Error('File was removed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const missing = new File([], 'missing.txt');
    const available = new File(['ok'], 'available.txt');
    await sender.manager.offerFiles(
      [missing, available].map((file) => ({ file, relativePath: file.name })),
      'batch'
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(sender.manager.getQueue()).toMatchObject([
      { name: 'missing.txt', status: 'error' },
      { name: 'available.txt', status: 'completed' },
    ]);
    expect(receiver.manager.getQueue()).toMatchObject([{ name: 'available.txt', status: 'completed' }]);
  });

  it('keeps verified downloads available after a bulk cancel or a late cancel message', async () => {
    const id = await sender.manager.offerFile(new File(['abc'], 'saved.txt'));
    await vi.advanceTimersByTimeAsync(0);
    expect(receiver.manager.getQueue()[0].status).toBe('completed');

    sender.manager.cancelAll();
    receiver.manager.cancelAll();
    receiver.events.onControlMessage?.({ type: 'CANCEL_TRANSFER', transferId: id });
    sender.events.onControlMessage?.({ type: 'FILE_REJECT', transferId: id });

    expect(sender.manager.getQueue()[0].status).toBe('completed');
    expect(receiver.manager.getQueue()[0]).toMatchObject({ status: 'completed', verified: true });
    expect(await receiver.manager.getQueue()[0].downloadBlob!.text()).toBe('abc');
  });
});
