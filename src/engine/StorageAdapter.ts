import { IDBStorage } from '../utils/idbStorage.js';

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
  private fileName: string;

  constructor(fileName: string) {
    this.fileName = fileName;
  }

  public async init(): Promise<void> {
    if ('storage' in navigator && 'getDirectory' in navigator.storage) {
      const root = await navigator.storage.getDirectory();
      this.fileHandle = await root.getFileHandle(this.fileName, { create: true });
      this.writableStream = await (this.fileHandle as any).createWritable();
    } else {
      throw new Error('OPFS not supported');
    }
  }

  public async writeChunk(chunkIndex: number, offset: bigint, data: Uint8Array): Promise<void> {
    if (!this.writableStream) throw new Error('OPFS writer not initialized');
    await this.writableStream.write({
      type: 'write',
      position: Number(offset),
      data: data as BufferSource
    });
  }

  public async close(name: string, type: string): Promise<Blob | null> {
    if (this.writableStream) {
      await this.writableStream.close();
    }
    if (this.fileHandle) {
      const file = await this.fileHandle.getFile();
      return file;
    }
    return null;
  }

  public async abort(): Promise<void> {
    if (this.writableStream) {
      try {
        await this.writableStream.abort();
      } catch (e) {}
    }
  }
}

export class IndexedDBFallbackWriter implements StorageWriter {
  private transferId: string;
  private totalChunks: number;
  private memoryChunks: Map<number, Uint8Array> = new Map();
  private maxMemoryChunks: number = 16;

  constructor(transferId: string, totalChunks: number) {
    this.transferId = transferId;
    this.totalChunks = totalChunks;
  }

  public async writeChunk(chunkIndex: number, offset: bigint, data: Uint8Array): Promise<void> {
    if (this.memoryChunks.size >= this.maxMemoryChunks) {
      const firstKey = this.memoryChunks.keys().next().value;
      if (firstKey !== undefined) {
        this.memoryChunks.delete(firstKey);
      }
    }
    this.memoryChunks.set(chunkIndex, data);
    await IDBStorage.saveChunk(this.transferId, chunkIndex, data);
  }

  public async close(name: string, type: string): Promise<Blob> {
    const parts: BlobPart[] = [];
    for (let i = 0; i < this.totalChunks; i++) {
      let chunk = this.memoryChunks.get(i);
      if (!chunk) {
        chunk = await IDBStorage.getChunk(this.transferId, i) || new Uint8Array(0);
      }
      parts.push(chunk as BlobPart);
    }

    const blob = new Blob(parts, { type: type || 'application/octet-stream' });
    this.memoryChunks.clear();
    return blob;
  }

  public async abort(): Promise<void> {
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
    try {
      const opfsWriter = new OPFSWriter(`${transferId}_${fileName}`);
      await opfsWriter.init();
      return { writer: opfsWriter, strategy: 'opfs' };
    } catch (e) {
      console.warn('OPFS not supported, falling back to IndexedDB', e);
    }

    // 3. Fallback to IndexedDB / Blob assembly
    return {
      writer: new IndexedDBFallbackWriter(transferId, totalChunks),
      strategy: 'indexeddb'
    };
  }
}
