import { IDBStorage } from '../utils/idbStorage.js';

const OPFS_WRITE_BATCH_BYTES = 1024 * 1024;
const IDB_CHUNKS_PER_BATCH = 32;

export interface StorageWriter {
  writeChunk(chunkIndex: number, offset: bigint, data: Uint8Array): Promise<void>;
  close(name: string, type: string): Promise<Blob | string | null>;
  abort(): Promise<void>;
}

export class DirectFSWriter implements StorageWriter {
  private writableStream: FileSystemWritableFileStream;

  constructor(writableStream: FileSystemWritableFileStream) {
    this.writableStream = writableStream;
  }

  public async writeChunk(chunkIndex: number, offset: bigint, data: Uint8Array): Promise<void> {
    await this.writableStream.write({
      type: 'write',
      position: Number(offset),
      data: data as BufferSource
    });
  }

  public async close(name: string, type: string): Promise<Blob | null> {
    await this.writableStream.close();
    return null; // File written directly to user selected disk location!
  }

  public async abort(): Promise<void> {
    try {
      await this.writableStream.abort();
    } catch (e) {}
  }
}

export class OPFSWriter implements StorageWriter {
  private fileHandle: FileSystemFileHandle | null = null;
  private writableStream: FileSystemWritableFileStream | null = null;
  private root: FileSystemDirectoryHandle | null = null;
  private buffer: Uint8Array<ArrayBuffer> | null = null;
  private bufferedBytes = 0;
  private bufferedOffset = 0;

  constructor(private fileName: string, private fileSize: number) {}

  public async init(): Promise<void> {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.getDirectory !== 'function') {
      throw new Error('OPFS not supported');
    }
    this.root = await navigator.storage.getDirectory();
    this.fileHandle = await this.root.getFileHandle(this.fileName, { create: true });
    this.writableStream = await this.fileHandle.createWritable();
  }

  public async writeChunk(chunkIndex: number, offset: bigint, data: Uint8Array): Promise<void> {
    if (!this.writableStream) throw new Error('OPFS writer not initialized');
    if (data.byteLength === 0) return;

    const position = Number(offset);
    const batchSize = Math.min(this.fileSize, OPFS_WRITE_BATCH_BYTES);
    if (this.bufferedBytes > 0 &&
        (position !== this.bufferedOffset + this.bufferedBytes || this.bufferedBytes + data.byteLength > batchSize)) {
      await this.flushBuffer();
    }
    if (data.byteLength >= batchSize) {
      await this.writableStream.write({ type: 'write', position, data: data as BufferSource });
      return;
    }
    this.buffer ??= new Uint8Array(batchSize);
    if (this.bufferedBytes === 0) this.bufferedOffset = position;
    this.buffer.set(data, this.bufferedBytes);
    this.bufferedBytes += data.byteLength;
    if (this.bufferedBytes === batchSize) await this.flushBuffer();
  }

  private async flushBuffer(): Promise<void> {
    if (!this.writableStream || !this.buffer || this.bufferedBytes === 0) return;
    await this.writableStream.write({
      type: 'write', position: this.bufferedOffset, data: this.buffer.subarray(0, this.bufferedBytes)
    });
    this.bufferedBytes = 0;
  }

  public async close(name: string, type: string): Promise<Blob | null> {
    if (this.writableStream) {
      await this.flushBuffer();
      await this.writableStream.close();
      this.writableStream = null;
      this.buffer = null;
    }
    if (this.fileHandle) {
      const file = await this.fileHandle.getFile();
      return file;
    }
    return null;
  }

  public async abort(): Promise<void> {
    const stream = this.writableStream;
    this.writableStream = null;
    this.buffer = null;
    this.bufferedBytes = 0;
    await stream?.abort().catch(() => {});
    if (this.fileHandle) {
      this.fileHandle = null;
      await this.root?.removeEntry(this.fileName).catch(() => {});
    }
  }
}

export class IndexedDBFallbackWriter implements StorageWriter {
  private transferId: string;
  private totalChunks: number;
  private memoryChunks: Map<number, Uint8Array> = new Map();
  private maxMemoryChunks: number = 64;
  private pendingBatch: { transferId: string; chunkIndex: number; data: Uint8Array }[] = [];

  constructor(transferId: string, totalChunks: number) {
    this.transferId = transferId;
    this.totalChunks = totalChunks;
  }

  private async flushBatch(): Promise<void> {
    if (this.pendingBatch.length === 0) return;
    const batch = this.pendingBatch;
    this.pendingBatch = [];
    await IDBStorage.saveChunksBatch(batch);
  }

  public async writeChunk(chunkIndex: number, offset: bigint, data: Uint8Array): Promise<void> {
    if (this.memoryChunks.size >= this.maxMemoryChunks) {
      const firstKey = this.memoryChunks.keys().next().value;
      if (firstKey !== undefined) {
        this.memoryChunks.delete(firstKey);
      }
    }
    this.memoryChunks.set(chunkIndex, data);
    this.pendingBatch.push({ transferId: this.transferId, chunkIndex, data });
    if (this.pendingBatch.length >= IDB_CHUNKS_PER_BATCH) {
      await this.flushBatch();
    }
  }

  public async close(name: string, type: string): Promise<Blob> {
    await this.flushBatch();
    const parts: BlobPart[] = [];
    for (let start = 0; start < this.totalChunks; start += IDB_CHUNKS_PER_BATCH) {
      const count = Math.min(IDB_CHUNKS_PER_BATCH, this.totalChunks - start);
      const batch: (Uint8Array | null)[] = Array.from({ length: count }, (_, i) => this.memoryChunks.get(start + i) ?? null);
      const saved = batch.includes(null) ? await IDBStorage.getChunks(this.transferId, start, count) : batch;
      for (let i = 0; i < count; i++) {
        const chunk = batch[i] ?? saved[i];
        if (!chunk) throw new Error('A saved chunk is missing. Ask the sender to resend the file.');
        parts.push(chunk as BlobPart);
      }
    }

    const blob = new Blob(parts, { type: type || 'application/octet-stream' });
    this.memoryChunks.clear();
    return blob;
  }

  public async abort(): Promise<void> {
    this.pendingBatch = [];
    this.memoryChunks.clear();
    await IDBStorage.clearTransferChunks(this.transferId);
  }
}

export class StorageAdapter {
  /**
   * Automatically picks the best writer strategy available in the browser.
   */
  public static async createWriter(
    transferId: string,
    fileName: string,
    fileSize: number,
    totalChunks: number,
    preferDirectSave: boolean = false
  ): Promise<{ writer: StorageWriter; strategy: 'direct_fs' | 'opfs' | 'indexeddb' }> {
    // 1. Direct File System Access API if user preferred & available
    if (preferDirectSave && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName
        });
        const writable = await handle.createWritable();
        return { writer: new DirectFSWriter(writable), strategy: 'direct_fs' };
      } catch (e) {
        console.warn('Direct FS picker cancelled or failed, falling back to OPFS', e);
      }
    }

    // 2. OPFS if available
    const opfsWriter = new OPFSWriter(`${transferId}_${fileName}`, fileSize);
    try {
      await opfsWriter.init();
      return { writer: opfsWriter, strategy: 'opfs' };
    } catch (e) {
      await opfsWriter.abort();
      console.warn('OPFS not supported, falling back to IndexedDB', e);
    }

    // 3. Fallback to IndexedDB / Blob assembly
    return {
      writer: new IndexedDBFallbackWriter(transferId, totalChunks),
      strategy: 'indexeddb'
    };
  }
}
