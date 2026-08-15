/**
 * idbStorage helper for persistent transfer state and chunk cache.
 */

const DB_NAME = 'ShreeDB';
const DB_VERSION = 1;
const STORE_TRANSFERS = 'transfers';
const STORE_CHUNKS = 'chunk_cache';

const inMemoryStore = new Map<string, any>();
const inMemoryChunks = new Map<string, Uint8Array>();

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
    const db = await this.getDB();
    const key = `${transferId}_${chunkIndex}`;
    if (!db) {
      inMemoryChunks.set(key, data);
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readwrite');
      tx.objectStore(STORE_CHUNKS).put({ key, transferId, chunkIndex, data });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getChunk(transferId: string, chunkIndex: number): Promise<Uint8Array | null> {
    const db = await this.getDB();
    const key = `${transferId}_${chunkIndex}`;
    if (!db) {
      return inMemoryChunks.get(key) || null;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readonly');
      const req = tx.objectStore(STORE_CHUNKS).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => reject(req.error);
    });
  }

  public static async clearTransferChunks(transferId: string): Promise<void> {
    const db = await this.getDB();
    if (!db) {
      for (const k of Array.from(inMemoryChunks.keys())) {
        if (k.startsWith(`${transferId}_`)) {
          inMemoryChunks.delete(k);
        }
      }
      inMemoryStore.delete(transferId);
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CHUNKS, STORE_TRANSFERS], 'readwrite');
      const chunkStore = tx.objectStore(STORE_CHUNKS);
      const index = chunkStore.openCursor();
      index.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          if (cursor.value.transferId === transferId) {
            cursor.delete();
          }
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
