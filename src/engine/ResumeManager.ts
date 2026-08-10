import { IDBStorage } from '../utils/idbStorage.js';

export class ResumeManager {
  private transferId: string;
  private totalChunks: number;
  private receivedChunks: Set<number> = new Set();

  constructor(transferId: string, totalChunks: number) {
    this.transferId = transferId;
    this.totalChunks = totalChunks;
  }

  public async initFromStorage(): Promise<void> {
    const saved = await IDBStorage.getTransferState(this.transferId);
    if (saved && Array.isArray(saved.receivedChunks)) {
      this.receivedChunks = new Set(saved.receivedChunks);
    }
  }

  public async markChunkReceived(chunkIndex: number): Promise<void> {
    this.receivedChunks.add(chunkIndex);
    if (this.receivedChunks.size % 10 === 0 || this.receivedChunks.size === this.totalChunks) {
      await this.saveState();
    }
  }

  public async saveState(): Promise<void> {
    await IDBStorage.saveTransferState(this.transferId, {
      totalChunks: this.totalChunks,
      receivedChunks: Array.from(this.receivedChunks)
    });
  }

  public isComplete(): boolean {
    return this.receivedChunks.size === this.totalChunks;
  }

  public getReceivedCount(): number {
    return this.receivedChunks.size;
  }

  public getMissingChunkIndices(): number[] {
    const missing: number[] = [];
    for (let i = 0; i < this.totalChunks; i++) {
      if (!this.receivedChunks.has(i)) {
        missing.push(i);
      }
    }
    return missing;
  }

  /**
   * Returns the next sequential missing chunk index starting from 0.
   */
  public getFirstMissingChunkIndex(): number {
    for (let i = 0; i < this.totalChunks; i++) {
      if (!this.receivedChunks.has(i)) {
        return i;
      }
    }
    return this.totalChunks;
  }

  public async clear(): Promise<void> {
    this.receivedChunks.clear();
    await IDBStorage.clearTransferChunks(this.transferId);
  }
}
