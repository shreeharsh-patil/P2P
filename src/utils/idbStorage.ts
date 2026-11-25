/**
 * idbStorage helper for persistent transfer state and chunk cache.
 */

const DB_NAME = 'ShreeDB';
const DB_VERSION = 1;
const STORE_TRANSFERS = 'transfers';
const STORE_CHUNKS = 'chunk_cache';

const inMemoryStore = new Map<string, any>();
const inMemoryChunks = new Map<string, Map<number, Uint8Array>>();

export class IDBStorage {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static getDB(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') {
      return Promise.resolve(null);
    }
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_TRANSFERS)) {
          db.createObjectStore(STORE_TRANSFERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          db.createObjectStore(STORE_CHUNKS, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  public static async saveTransferState(id: string, state: any): Promise<void> {
    const db = await this.getDB();
    if (!db) {
      inMemoryStore.set(id, { id, ...state, updatedAt: Date.now() });
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRANSFERS, 'readwrite');
      tx.objectStore(STORE_TRANSFERS).put({ id, ...state, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getTransferState(id: string): Promise<any | null> {
    const db = await this.getDB();
    if (!db) {
      return inMemoryStore.get(id) || null;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_TRANSFERS, 'readonly');
      const req = tx.objectStore(STORE_TRANSFERS).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  public static async saveChunk(transferId: string, chunkIndex: number, data: Uint8Array): Promise<void> {
    return this.saveChunksBatch([{ transferId, chunkIndex, data }]);
  }

  public static async saveChunksBatch(
    entries: { transferId: string; chunkIndex: number; data: Uint8Array }[]
  ): Promise<void> {
    if (entries.length === 0) return;
    const db = await this.getDB();
    if (!db) {
      for (const entry of entries) {
        let chunks = inMemoryChunks.get(entry.transferId);
        if (!chunks) {
          chunks = new Map();
          inMemoryChunks.set(entry.transferId, chunks);
        }
        chunks.set(entry.chunkIndex, entry.data);
      }
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readwrite');
      const store = tx.objectStore(STORE_CHUNKS);
      for (const entry of entries) {
        store.put({
          key: `${entry.transferId}_${entry.chunkIndex}`,
          transferId: entry.transferId,
          chunkIndex: entry.chunkIndex,
          data: entry.data
        });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getChunk(transferId: string, chunkIndex: number): Promise<Uint8Array | null> {
    const [chunk] = await this.getChunks(transferId, chunkIndex, 1);
    return chunk;
  }

  public static async getChunks(transferId: string, start: number, count: number): Promise<(Uint8Array | null)[]> {
    const db = await this.getDB();
    const chunks = Array<Uint8Array | null>(count).fill(null);
    if (!db) {
      const cached = inMemoryChunks.get(transferId);
      for (let i = 0; i < count; i++) chunks[i] = cached?.get(start + i) ?? null;
      return chunks;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readonly');
      const store = tx.objectStore(STORE_CHUNKS);
      for (let i = 0; i < count; i++) {
        const req = store.get(`${transferId}_${start + i}`);
        req.onsuccess = () => { chunks[i] = req.result?.data ?? null; };
      }
      tx.oncomplete = () => resolve(chunks);
      tx.onabort = () => reject(tx.error ?? new Error('Could not read saved file chunks.'));
    });
  }

  public static async clearTransferChunks(transferId: string): Promise<void> {
    const db = await this.getDB();
    if (!db) {
      inMemoryChunks.delete(transferId);
      inMemoryStore.delete(transferId);
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CHUNKS, STORE_TRANSFERS], 'readwrite');
      tx.objectStore(STORE_TRANSFERS).delete(transferId);
      const prefix = `${transferId}_`;
      const chunkStore = tx.objectStore(STORE_CHUNKS);
      const request = chunkStore.openKeyCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const chunkIndex = String(cursor.primaryKey).slice(prefix.length);
          if (/^\d+$/.test(chunkIndex)) chunkStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Could not clear saved file chunks.'));
    });
  }
}
