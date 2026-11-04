import { WebRTCManager } from '../network/WebRTCManager';
import { TransferItem, TransferMeta, ControlMessage } from './types';
import { ChunkReader } from './ChunkReader';
import { TransferProtocol } from './TransferProtocol';
import { BackpressureController } from './BackpressureController';
import { StorageAdapter, StorageWriter } from './StorageAdapter';
import { IntegrityManager } from './IntegrityManager';
import { ResumeManager } from './ResumeManager';
import { IDBStorage } from '../utils/idbStorage';

export interface TransferManagerCallbacks {
  onQueueUpdated?: (queue: TransferItem[]) => void;
  onTransferProgress?: (item: TransferItem) => void;
  onTransferCompleted?: (item: TransferItem, downloadUrl?: string | null) => void;
  onError?: (transferId: string, error: string) => void;
  onOfferReceived?: (item: TransferItem) => void;
}

// Hard bounds for peer-supplied offers. Anything outside these is rejected
// before it can drive allocations or IndexedDB writes.
const MAX_TOTAL_CHUNKS = 5_000_000;
const MAX_FILE_SIZE = 2 * 1024 ** 4; // 2 TiB
const MIN_CHUNK_SIZE = 4 * 1024;
const MAX_CHUNK_SIZE = 1024 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

/** Strip directory components so a peer can never choose a path. */
function sanitizeFileName(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop()?.replace(/\0/g, '').trim();
  if (!base || base === '.' || base === '..') return fallback;
  return base.slice(0, 255);
}

export class TransferManager {
  private rtc: WebRTCManager;
  private callbacks: TransferManagerCallbacks = {};
  private queue: Map<string, TransferItem> = new Map();
  private chunkReaders: Map<string, ChunkReader> = new Map();
  private storageWriters: Map<string, StorageWriter> = new Map();
  private resumeManagers: Map<string, ResumeManager> = new Map();
  private backpressureControllers: Map<string, BackpressureController> = new Map();

  // Leave room for the 36-byte framing header under common WebRTC message limits.
  private defaultChunkSize: number = 60 * 1024;
  private autoAccept: boolean = false;
  private speedTimer: any = null;
  private lastBytesTransferred: Map<string, { bytes: number; timestamp: number }> = new Map();

  constructor(rtc: WebRTCManager, callbacks: TransferManagerCallbacks = {}) {
    this.rtc = rtc;
    this.callbacks = callbacks;
    this.setupListeners();
    this.startSpeedCalculation();
  }

  public setCallbacks(callbacks: TransferManagerCallbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public setChunkSize(bytes: number) {
    this.defaultChunkSize = bytes;
  }

  public setAutoAccept(enabled: boolean) {
    this.autoAccept = enabled;
  }

  public isAutoAccept(): boolean {
    return this.autoAccept;
  }

  private lastProgressEmit: Map<string, number> = new Map();

  /**
   * Progress must never move backwards when a transfer resumes mid-file.
   */
  private percentFor(size: number, bytes: number, previous: number): number {
    if (size <= 0) return 100;
    return Math.max(previous, Math.min(100, Math.round((bytes / size) * 100)));
  }

  public getQueue(): TransferItem[] {
    return Array.from(this.queue.values());
  }

  private updateQueueItem(id: string, updates: Partial<TransferItem>, forceEmit: boolean = true) {
    const item = this.queue.get(id);
    if (item) {
      Object.assign(item, updates);
      const now = Date.now();
      const lastEmit = this.lastProgressEmit.get(id) || 0;

      if (forceEmit || now - lastEmit > 40 || item.progress.percent >= 100) {
        this.lastProgressEmit.set(id, now);
        if (this.callbacks.onTransferProgress) {
          this.callbacks.onTransferProgress(item);
        }
        if (this.callbacks.onQueueUpdated) {
          this.callbacks.onQueueUpdated(this.getQueue());
        }
      }
    }
  }

  public resetSession(): void {
    // A manual session leave must not permanently stop the speed timer or event listeners.
    for (const id of Array.from(this.queue.keys())) {
      const item = this.queue.get(id);
      if (item?.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
      void this.storageWriters.get(id)?.abort();
      this.cleanup(id);
    }
    this.queue.clear();
    this.lastBytesTransferred.clear();
    this.lastProgressEmit.clear();
    this.callbacks.onQueueUpdated?.([]);
  }

  public destroy() {
    this.resetSession();
    if (this.speedTimer) {
      clearInterval(this.speedTimer);
      this.speedTimer = null;
    }
  }

  private setupListeners() {
    this.rtc.setEvents({
      onControlMessage: (msg) => this.handleControlMessage(msg),
      onFileChunk: (buffer) => this.handleIncomingChunk(buffer)
    });
  }

  /**
   * Sender API: Selects a file and initiates P2P upload.
   */
  public async offerFile(file: File, relativePath?: string, batchId?: string): Promise<string> {
    const id = Math.random().toString(36).substring(2, 11);
    const chunkSize = this.defaultChunkSize;
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));

    const chunkReader = new ChunkReader(file, chunkSize);
    this.chunkReaders.set(id, chunkReader);

    // Compute checksum progressively
    const checksum = await IntegrityManager.calculateFileHash(file);

    const item: TransferItem = {
      id,
      name: file.name,
      relativePath: relativePath || file.name,
      batchId,
      size: file.size,
      type: file.type || 'application/octet-stream',
      totalChunks,
      chunkSize,
      sha256: checksum,
      direction: 'upload',
      status: 'offering',
      file,
      progress: {
        bytesTransferred: 0,
        chunksTransferred: 0,
        speed: 0,
        eta: 0,
        percent: 0
      }
    };

    this.queue.set(id, item);
    if (this.callbacks.onQueueUpdated) {
      this.callbacks.onQueueUpdated(this.getQueue());
    }

    // Send FILE_OFFER over RTC control channel
    if (!this.rtc.sendControlMessage({
      type: 'FILE_OFFER',
      transferId: id,
      meta: {
        id,
        name: file.name,
        relativePath: relativePath || file.name,
        batchId,
        size: file.size,
        type: file.type || 'application/octet-stream',
        totalChunks,
        chunkSize,
        sha256: checksum
      }
    })) {
      this.updateQueueItem(id, {
        status: 'error',
        error: 'Peer connection is not ready. Please reconnect and try again.'
      });
      this.cleanup(id);
    }

    return id;
  }

  /**
   * Batch Controls: Accept, reject, pause, resume, cancel all items in queue
   */
  public async acceptAllOffers(preferDirectSave: boolean = false): Promise<void> {
    for (const [id, item] of this.queue.entries()) {
      if (item.status === 'offering' && item.direction === 'download') {
        await this.acceptOffer(id, preferDirectSave);
      }
    }
  }

  public rejectAllOffers(): void {
    for (const [id, item] of this.queue.entries()) {
      if (item.status === 'offering' && item.direction === 'download') {
        this.rejectOffer(id);
      }
    }
  }

  public pauseAll(): void {
    for (const [id, item] of this.queue.entries()) {
      if (item.status === 'transferring') {
        this.pauseTransfer(id);
      }
    }
  }

  public resumeAll(): void {
    for (const [id, item] of this.queue.entries()) {
      if (item.status === 'paused') {
        this.resumeTransfer(id);
      }
    }
  }

  public cancelAll(): void {
    // Cancel only work that is actually in flight; completed items keep their
    // verified result until they are explicitly cleared below.
    for (const id of Array.from(this.queue.keys())) {
      const item = this.queue.get(id);
      if (item && (item.status === 'offering' || item.status === 'transferring' ||
                   item.status === 'paused' || item.status === 'queued')) {
        this.cancelTransfer(id);
      }
    }

    // Clear finished rows and release their blob URLs so a long session does
    // not retain every received file.
    for (const [id, item] of Array.from(this.queue.entries())) {
      if (item.status === 'completed' || item.status === 'cancelled' || item.status === 'error') {
        if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
        this.queue.delete(id);
        this.cleanup(id);
      }
    }
    this.callbacks.onQueueUpdated?.(this.getQueue());
  }

  /**
   * Receiver API: Accepts an incoming file offer.
   */
  public async acceptOffer(transferId: string, preferDirectSave: boolean = false): Promise<void> {
    const item = this.queue.get(transferId);
    if (!item) return;
    // Double-click / repeated auto-accept protection: only an untouched offer
    // may start a download.
    if (item.status !== 'offering') return;
    let writer: StorageWriter | undefined;

    try {
      this.updateQueueItem(transferId, { status: 'transferring', startTime: Date.now() });

      // Initialize Storage Writer (Direct FS, OPFS, or IDB)
      const storage = await StorageAdapter.createWriter(
        transferId,
        item.name,
        item.size,
        item.totalChunks,
        preferDirectSave
      );
      writer = storage.writer;
      this.storageWriters.set(transferId, writer);

      // Initialize Resume Manager
      const resumeMgr = new ResumeManager(transferId, item.totalChunks);
      await resumeMgr.initFromStorage();
      this.resumeManagers.set(transferId, resumeMgr);

      const startChunkIndex = resumeMgr.getFirstMissingChunkIndex();

      // Send FILE_ACCEPT back to sender
      if (!this.rtc.sendControlMessage({
        type: 'FILE_ACCEPT',
        transferId,
        receivedIndex: startChunkIndex
      })) {
        throw new Error('Peer connection is not ready. Please try accepting the file again.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to prepare the file download.';
      await writer?.abort();
      this.updateQueueItem(transferId, { status: 'error', error: message });
      this.callbacks.onError?.(transferId, message);
    }
  }

  /**
   * Receiver API: Rejects an incoming file offer.
   */
  public rejectOffer(transferId: string): void {
    const item = this.queue.get(transferId);
    if (item) {
      this.updateQueueItem(transferId, { status: 'cancelled' });
      this.rtc.sendControlMessage({
        type: 'FILE_REJECT',
        transferId
      });
    }
  }

  /**
   * Controls (Pause, Resume, Cancel)
   */
  public pauseTransfer(transferId: string): void {
    const item = this.queue.get(transferId);
    if (item && item.status === 'transferring') {
      this.updateQueueItem(transferId, { status: 'paused' });
      this.rtc.sendControlMessage({ type: 'PAUSE_TRANSFER', transferId });
    }
  }

  public resumeTransfer(transferId: string): void {
    const item = this.queue.get(transferId);
    if (item && item.status === 'paused') {
      this.updateQueueItem(transferId, { status: 'transferring' });
      this.rtc.sendControlMessage({ type: 'RESUME_TRANSFER', transferId });

      if (item.direction === 'upload') {
        this.startSendingChunks(transferId, item.progress.chunksTransferred);
      }
    }
  }

  public cancelTransfer(transferId: string): void {
    const item = this.queue.get(transferId);
    if (item) {
      this.updateQueueItem(transferId, { status: 'cancelled' });
      this.rtc.sendControlMessage({ type: 'CANCEL_TRANSFER', transferId });
      void this.storageWriters.get(transferId)?.abort();
      this.cleanup(transferId);
    }
  }

  /**
   * Validates a peer-supplied offer. Returns an error message, or null when
   * the metadata is internally consistent and within safe bounds.
   */
  private validateOfferMeta(meta: TransferMeta): string | null {
    if (!Number.isInteger(meta.size) || meta.size < 0 || meta.size > MAX_FILE_SIZE) {
      return 'Invalid file size';
    }
    if (!Number.isInteger(meta.chunkSize) || meta.chunkSize < MIN_CHUNK_SIZE || meta.chunkSize > MAX_CHUNK_SIZE) {
      return 'Invalid chunk size';
    }
    if (!Number.isInteger(meta.totalChunks) || meta.totalChunks < 1 || meta.totalChunks > MAX_TOTAL_CHUNKS) {
      return 'Invalid chunk count';
    }
    const expectedChunks = Math.max(1, Math.ceil(meta.size / meta.chunkSize));
    if (meta.totalChunks !== expectedChunks) {
      return 'Chunk count does not match file size';
    }
    if (!meta.sha256 || !SHA256_HEX.test(meta.sha256)) {
      return 'Invalid file checksum';
    }
    if (typeof meta.name !== 'string' || meta.name.length === 0) {
      return 'Invalid file name';
    }
    return null;
  }

  /**
   * Incoming Control Message Dispatcher
   */
  private async handleControlMessage(msg: ControlMessage) {
    if (!msg.transferId) return;

    switch (msg.type) {
      case 'FILE_OFFER': {
        if (!msg.meta) return;
        if (this.queue.has(msg.transferId)) return;
        const validationError = this.validateOfferMeta(msg.meta);
        if (validationError) {
          console.warn(`[Transfer] Rejected offer ${msg.transferId}: ${validationError}`);
          this.rtc.sendControlMessage({ type: 'FILE_REJECT', transferId: msg.transferId });
          return;
        }
        const safeName = sanitizeFileName(msg.meta.name, 'download');
        const item: TransferItem = {
          ...msg.meta,
          name: safeName,
          relativePath: sanitizeFileName(msg.meta.relativePath || safeName, safeName),
          direction: 'download',
          status: 'offering',
          progress: {
            bytesTransferred: 0,
            chunksTransferred: 0,
            speed: 0,
            eta: 0,
            percent: 0
          }
        };
        this.queue.set(msg.transferId, item);
        if (this.callbacks.onQueueUpdated) this.callbacks.onQueueUpdated(this.getQueue());
        if (this.callbacks.onOfferReceived) this.callbacks.onOfferReceived(item);

        if (this.autoAccept) {
          this.acceptOffer(msg.transferId);
        }
        break;
      }

      case 'FILE_ACCEPT': {
        const item = this.queue.get(msg.transferId);
        if (item && item.direction === 'upload' && item.status === 'offering') {
          this.updateQueueItem(msg.transferId, { status: 'transferring', startTime: Date.now() });
          const startChunkIndex = msg.receivedIndex || 0;
          this.startSendingChunks(msg.transferId, startChunkIndex);
        }
        break;
      }

      case 'FILE_REJECT': {
        this.updateQueueItem(msg.transferId, { status: 'cancelled', error: 'Receiver declined file transfer' });
        this.cleanup(msg.transferId);
        break;
      }

      case 'PAUSE_TRANSFER': {
        this.updateQueueItem(msg.transferId, { status: 'paused' });
        break;
      }

      case 'RESUME_TRANSFER': {
        const item = this.queue.get(msg.transferId);
        if (item) {
          this.updateQueueItem(msg.transferId, { status: 'transferring' });
          if (item.direction === 'upload') {
            this.startSendingChunks(msg.transferId, item.progress.chunksTransferred);
          }
        }
        break;
      }

      case 'CANCEL_TRANSFER': {
        this.updateQueueItem(msg.transferId, { status: 'cancelled', error: 'Transfer cancelled by peer' });
        void this.storageWriters.get(msg.transferId)?.abort();
        this.cleanup(msg.transferId);
        break;
      }

      case 'VERIFICATION_RESULT': {
        const item = this.queue.get(msg.transferId);
        if (item) {
          this.updateQueueItem(msg.transferId, {
            status: 'completed',
            verified: msg.verified,
            endTime: Date.now()
          });
          if (this.callbacks.onTransferCompleted) {
            this.callbacks.onTransferCompleted(item, null);
          }
        }
        this.cleanup(msg.transferId);
        break;
      }
    }
  }

  /**
   * Sender: Chunk Loop with Backpressure Control
   */
  private async startSendingChunks(transferId: string, startIndex: number) {
    const item = this.queue.get(transferId);
    const chunkReader = this.chunkReaders.get(transferId);
    if (!item || !chunkReader || !this.rtc.areChannelsOpen()) return;

    if (this.rtc.fileChannel && !this.backpressureControllers.has(transferId)) {
      this.backpressureControllers.set(
        transferId,
        new BackpressureController(this.rtc.fileChannel, item.chunkSize * 2, item.chunkSize)
      );
    }

    const backpressure = this.backpressureControllers.get(transferId);
    const totalChunks = chunkReader.getTotalChunks();

    for (let index = startIndex; index < totalChunks; index++) {
      const currentItem = this.queue.get(transferId);
      if (!currentItem || currentItem.status !== 'transferring') {
        break;
      }

      // Backpressure Check if WebRTC DataChannel is active
      if (backpressure) {
        await backpressure.waitIfBuffered();
      }

      try {
        const chunk = await chunkReader.readChunk(index);
        const packetBuffer = TransferProtocol.encodePacket(
          transferId,
          chunk.chunkIndex,
          chunk.offset,
          chunk.buffer
        );

        if (!this.rtc.sendFileChunk(packetBuffer)) {
          throw new Error('File channel is unavailable. Please wait for the peer connection to recover.');
        }

        const bytesTransferred = Number(chunk.offset) + chunk.length;
        const percent = this.percentFor(item.size, bytesTransferred, currentItem.progress.percent);

        this.updateQueueItem(transferId, {
          progress: {
            ...currentItem.progress,
            bytesTransferred: Math.max(currentItem.progress.bytesTransferred, bytesTransferred),
            chunksTransferred: index + 1,
            percent
          }
        }, false);
      } catch (e: any) {
        console.error(`Error sending chunk ${index}`, e);
        this.updateQueueItem(transferId, { status: 'error', error: e.message });
        break;
      }
    }
  }

  /**
   * Receiver: Handle incoming framed binary chunk packet
   */
  private async handleIncomingChunk(buffer: ArrayBuffer) {
    try {
      const packet = TransferProtocol.decodePacket(buffer);
      const { transferId, chunkIndex, offset, payload } = packet;

      const item = this.queue.get(transferId);
      const writer = this.storageWriters.get(transferId);
      const resumeMgr = this.resumeManagers.get(transferId);

      if (!item || !writer || !resumeMgr || item.status !== 'transferring') return;

      // Reject packets that do not line up with the accepted offer.
      if (chunkIndex >= item.totalChunks) {
        throw new Error(`Chunk index ${chunkIndex} exceeds the offered chunk count`);
      }
      const expectedOffset = BigInt(chunkIndex) * BigInt(item.chunkSize);
      if (offset !== expectedOffset) {
        throw new Error(`Chunk ${chunkIndex} has an unexpected offset`);
      }
      if (payload.byteLength > item.chunkSize) {
        throw new Error(`Chunk ${chunkIndex} exceeds the agreed chunk size`);
      }
      if (Number(offset) + payload.byteLength > item.size) {
        throw new Error(`Chunk ${chunkIndex} exceeds the offered file size`);
      }

      // Progressive Write to Disk/OPFS/IDB
      await writer.writeChunk(chunkIndex, offset, payload);
      await resumeMgr.markChunkReceived(chunkIndex);

      const bytesTransferred = Number(offset) + payload.byteLength;
      const percent = this.percentFor(item.size, bytesTransferred, item.progress.percent);

      this.updateQueueItem(transferId, {
        progress: {
          ...item.progress,
          bytesTransferred: Math.max(item.progress.bytesTransferred, bytesTransferred),
          chunksTransferred: resumeMgr.getReceivedCount(),
          percent
        }
      }, false);

      // Check if complete
      if (resumeMgr.isComplete()) {
        this.updateQueueItem(transferId, { status: 'verifying' });

        const blobOrResult = await writer.close(item.name, item.type);
        let downloadUrl: string | null = null;
        let verified = false;

        if (blobOrResult instanceof Blob) {
          downloadUrl = URL.createObjectURL(blobOrResult);
          const computedHash = await IntegrityManager.calculateFileHash(
            new File([blobOrResult], item.name, { type: item.type })
          );
          verified = item.sha256 ? IntegrityManager.verifyHash(computedHash, item.sha256) : true;
        } else {
          // Direct FS file written directly to user disk
          verified = true;
        }

        this.updateQueueItem(transferId, {
          status: 'completed',
          verified,
          downloadUrl: downloadUrl || undefined,
          endTime: Date.now()
        });

        // Notify sender of verification result
        this.rtc.sendControlMessage({
          type: 'VERIFICATION_RESULT',
          transferId,
          verified
        });

        if (this.callbacks.onTransferCompleted) {
          this.callbacks.onTransferCompleted(this.queue.get(transferId)!, downloadUrl);
        }

        await resumeMgr.clear();
        this.cleanup(transferId);
      }
    } catch (e: any) {
      console.error('Error handling incoming file chunk', e);
      const packetTransferId = buffer.byteLength >= 20
        ? new TextDecoder().decode(new Uint8Array(buffer, 4, 16)).replace(/\0/g, '')
        : undefined;
      if (packetTransferId && this.queue.has(packetTransferId)) {
        const message = e instanceof Error ? e.message : 'Unable to write incoming file data.';
        this.updateQueueItem(packetTransferId, { status: 'error', error: message });
        this.callbacks.onError?.(packetTransferId, message);
        void this.storageWriters.get(packetTransferId)?.abort();
        this.cleanup(packetTransferId);
      }
    }
  }

  /**
   * Calculates rolling transfer speed (bytes/sec) and ETA (seconds remaining)
   */
  private startSpeedCalculation() {
    this.speedTimer = setInterval(() => {
      const now = Date.now();

      this.queue.forEach((item, id) => {
        if (item.status === 'transferring') {
          const last = this.lastBytesTransferred.get(id);
          if (last) {
            const timeDiff = (now - last.timestamp) / 1000; // in seconds
            const bytesDiff = item.progress.bytesTransferred - last.bytes;

            if (timeDiff > 0) {
              const currentSpeed = Math.max(0, bytesDiff / timeDiff);
              const remainingBytes = item.size - item.progress.bytesTransferred;
              const eta = currentSpeed > 0 ? Math.ceil(remainingBytes / currentSpeed) : 0;

              this.updateQueueItem(id, {
                progress: {
                  ...item.progress,
                  speed: currentSpeed,
                  eta
                }
              });
            }
          }
          this.lastBytesTransferred.set(id, { bytes: item.progress.bytesTransferred, timestamp: now });
        }
      });
    }, 1000);
  }

  private cleanup(transferId: string) {
    this.chunkReaders.delete(transferId);
    this.storageWriters.delete(transferId);
    this.resumeManagers.delete(transferId);
    this.backpressureControllers.delete(transferId);
    this.lastBytesTransferred.delete(transferId);
    this.lastProgressEmit.delete(transferId);
    // Free any resumable state that is no longer needed. Idempotent: the
    // success path may already have cleared it.
    void IDBStorage.clearTransferChunks(transferId);
  }
}
