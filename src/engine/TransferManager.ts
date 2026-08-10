import { WebRTCManager } from '../network/WebRTCManager';
import { TransferItem, TransferMeta, ControlMessage } from './types';
import { ChunkReader } from './ChunkReader';
import { TransferProtocol } from './TransferProtocol';
import { BackpressureController } from './BackpressureController';
import { StorageAdapter, StorageWriter } from './StorageAdapter';
import { IntegrityManager } from './IntegrityManager';
import { ResumeManager } from './ResumeManager';

export interface TransferManagerCallbacks {
  onQueueUpdated?: (queue: TransferItem[]) => void;
  onTransferProgress?: (item: TransferItem) => void;
  onTransferCompleted?: (item: TransferItem, downloadUrl?: string | null) => void;
  onError?: (transferId: string, error: string) => void;
  onOfferReceived?: (item: TransferItem) => void;
}

export class TransferManager {
  private rtc: WebRTCManager;
  private callbacks: TransferManagerCallbacks = {};
  private queue: Map<string, TransferItem> = new Map();
  private chunkReaders: Map<string, ChunkReader> = new Map();
  private storageWriters: Map<string, StorageWriter> = new Map();
  private resumeManagers: Map<string, ResumeManager> = new Map();
  private backpressureControllers: Map<string, BackpressureController> = new Map();

  private defaultChunkSize: number = 256 * 1024; // 256 KB
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

  public getQueue(): TransferItem[] {
    return Array.from(this.queue.values());
  }

  private updateQueueItem(id: string, updates: Partial<TransferItem>) {
    const item = this.queue.get(id);
    if (item) {
      Object.assign(item, updates);
      if (this.callbacks.onTransferProgress) {
        this.callbacks.onTransferProgress(item);
      }
      if (this.callbacks.onQueueUpdated) {
        this.callbacks.onQueueUpdated(this.getQueue());
      }
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
  public async offerFile(file: File): Promise<string> {
    const id = Math.random().toString(36).substring(2, 11);
    const chunkSize = this.defaultChunkSize;
    const totalChunks = Math.ceil(file.size / chunkSize);

    const chunkReader = new ChunkReader(file, chunkSize);
    this.chunkReaders.set(id, chunkReader);

    // Compute checksum progressively
    const checksum = await IntegrityManager.calculateFileHash(file);

    const item: TransferItem = {
      id,
      name: file.name,
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
    this.rtc.sendControlMessage({
      type: 'FILE_OFFER',
      transferId: id,
      meta: {
        id,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        totalChunks,
        chunkSize,
        sha256: checksum
      }
    });

    return id;
  }

  /**
   * Receiver API: Accepts an incoming file offer.
   */
  public async acceptOffer(transferId: string, preferDirectSave: boolean = false): Promise<void> {
    const item = this.queue.get(transferId);
    if (!item) return;

    this.updateQueueItem(transferId, { status: 'transferring', startTime: Date.now() });

    // Initialize Storage Writer (Direct FS, OPFS, or IDB)
    const { writer } = await StorageAdapter.createWriter(
      transferId,
      item.name,
      item.size,
      item.totalChunks,
      preferDirectSave
    );
    this.storageWriters.set(transferId, writer);

    // Initialize Resume Manager
    const resumeMgr = new ResumeManager(transferId, item.totalChunks);
    await resumeMgr.initFromStorage();
    this.resumeManagers.set(transferId, resumeMgr);

    const startChunkIndex = resumeMgr.getFirstMissingChunkIndex();

    // Send FILE_ACCEPT back to sender
    this.rtc.sendControlMessage({
      type: 'FILE_ACCEPT',
      transferId,
      receivedIndex: startChunkIndex
    });
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
      this.cleanup(transferId);
    }
  }

  /**
   * Incoming Control Message Dispatcher
   */
  private async handleControlMessage(msg: ControlMessage) {
    if (!msg.transferId) return;

    switch (msg.type) {
      case 'FILE_OFFER': {
        if (!msg.meta) return;
        const item: TransferItem = {
          ...msg.meta,
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
        break;
      }

      case 'FILE_ACCEPT': {
        const item = this.queue.get(msg.transferId);
        if (item && item.direction === 'upload') {
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
        this.updateQueueItem(msg.transferId, { status: 'transferring' });
        break;
      }

      case 'CANCEL_TRANSFER': {
        this.updateQueueItem(msg.transferId, { status: 'cancelled', error: 'Transfer cancelled by peer' });
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

        this.rtc.sendFileChunk(packetBuffer);

        const bytesTransferred = Number(chunk.offset) + chunk.length;
        const percent = Math.min(100, Math.round((bytesTransferred / item.size) * 100));

        this.updateQueueItem(transferId, {
          progress: {
            ...currentItem.progress,
            bytesTransferred,
            chunksTransferred: index + 1,
            percent
          }
        });
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

      // Progressive Write to Disk/OPFS/IDB
      await writer.writeChunk(chunkIndex, offset, payload);
      await resumeMgr.markChunkReceived(chunkIndex);

      const bytesTransferred = Number(offset) + payload.byteLength;
      const percent = Math.min(100, Math.round((bytesTransferred / item.size) * 100));

      this.updateQueueItem(transferId, {
        progress: {
          ...item.progress,
          bytesTransferred,
          chunksTransferred: resumeMgr.getReceivedCount(),
          percent
        }
      });

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
  }
}
