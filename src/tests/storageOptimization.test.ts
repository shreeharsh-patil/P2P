import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntegrityManager } from '../engine/IntegrityManager';
import { IndexedDBFallbackWriter, OPFSWriter } from '../engine/StorageAdapter';
import { IDBStorage } from '../utils/idbStorage';

describe('File storage and hashing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeOpfs(size: number) {
    const content = new Uint8Array(size);
    const write = vi.fn(async ({ position, data }: { position: number; data: Uint8Array }) => {
      content.set(data, position);
    });
    const close = vi.fn(async () => {});
    const abort = vi.fn(async () => {});
    const removeEntry = vi.fn(async () => {});
    const root = {
      removeEntry,
      getFileHandle: async () => ({
        createWritable: async () => ({ write, close, abort }),
        getFile: async () => new File([content], 'test.bin'),
      })
    };
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
    return { writer: new OPFSWriter('test.bin', size), content, write, close, abort, removeEntry };
  }

  it('combines sequential writes into one write and flushes before closing', async () => {
    const { writer, write, close } = makeOpfs(8);
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await writer.init();
    await writer.writeChunk(0, 0n, bytes.subarray(0, 3));
    await writer.writeChunk(1, 3n, bytes.subarray(3, 6));
    expect(write).not.toHaveBeenCalled();
    await writer.writeChunk(2, 6n, bytes.subarray(6));
    const file = await writer.close('test.bin', '');

    expect(write).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(new Uint8Array(await file!.arrayBuffer())).toEqual(bytes);
  });

  it('keeps offsets correct after out-of-order chunks and discards an aborted file', async () => {
    const { writer, content, write, abort, removeEntry } = makeOpfs(8);
    await writer.init();
    await writer.writeChunk(1, 4n, new Uint8Array([5, 6, 7, 8]));
    await writer.writeChunk(0, 0n, new Uint8Array([1, 2, 3, 4]));
    expect(write).toHaveBeenCalledTimes(1);
    expect(content).toEqual(new Uint8Array([0, 0, 0, 0, 5, 6, 7, 8]));

    await writer.abort();
    expect(write).toHaveBeenCalledTimes(1);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(removeEntry).toHaveBeenCalledWith('test.bin');
  });

  it('reads persisted chunks in batches and clears only the matching transfer', async () => {
    const id = 'storage-test';
    const writer = new IndexedDBFallbackWriter(id, 130);
    const read = vi.spyOn(IDBStorage, 'getChunks');
    const expected = Uint8Array.from({ length: 130 }, (_, index) => index);
    for (const index of expected) {
      await writer.writeChunk(index, BigInt(index), new Uint8Array([index]));
    }
    await IDBStorage.saveTransferState(id, { receivedChunks: [0] });
    await IDBStorage.saveChunk(`${id}_other`, 0, new Uint8Array([99]));

    const file = await writer.close('test.bin', '');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(expected);
    expect(read).toHaveBeenCalledTimes(3);

    await writer.abort();
    expect(await IDBStorage.getTransferState(id)).toBeNull();
    expect(await IDBStorage.getChunk(id, 0)).toBeNull();
    expect(await IDBStorage.getChunk(`${id}_other`, 0)).toEqual(new Uint8Array([99]));
    await IDBStorage.clearTransferChunks(`${id}_other`);
  });

  it('preserves the checksum format used by existing peers for large files', async () => {
    const size = 16 * 1024 * 1024;
    const sampleSize = 5 * 1024 * 1024;
    const bytes = Uint8Array.from({ length: size }, (_, i) => (i >>> 11) & 255);
    const oldComposite = new Uint8Array(sampleSize * 3 + 8);
    oldComposite.set(bytes.subarray(0, sampleSize), 0);
    oldComposite.set(bytes.subarray(size / 2, size / 2 + sampleSize), sampleSize);
    oldComposite.set(bytes.subarray(size - sampleSize), sampleSize * 2);
    new DataView(oldComposite.buffer).setBigUint64(sampleSize * 3, BigInt(size), false);

    const expected = await IntegrityManager.calculateBufferHash(oldComposite.buffer);
    expect(await IntegrityManager.calculateFileHash(new File([bytes], 'large.bin'))).toBe(expected);
  });
});
