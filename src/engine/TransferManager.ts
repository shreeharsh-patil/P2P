import { WebRTCManager } from '../network/WebRTCManager';
import { TransferItem, TransferMeta, ControlMessage } from './types';
import { ChunkReader } from './ChunkReader';
import { TransferProtocol } from './TransferProtocol';
import { BackpressureController } from './BackpressureController';
import { StorageAdapter, StorageWriter } from './StorageAdapter';
import { IntegrityManager } from './IntegrityManager';
import { ResumeManager } from './ResumeManager';

const ACCEPT_RETRY_INTERVAL_MS = 500;
const ACCEPT_RETRY_WINDOW_MS = 45_000;
const TRANSFER_RETRY_INTERVAL_MS = 5_000;
const TRANSFER_RETRY_WINDOW_MS = 60_000;

export interface TransferManagerCallbacks {
  onQueueUpdated?: (queue: TransferItem[]) => void;
  onTransferProgress?: (item: TransferItem) => void;
  onTransferCompleted?: (item: TransferItem, downloadUrl?: string | null) => void;
  onError?: (transferId: string, error: string) => void;
  onOfferReceived?: (item: TransferItem) => void;
}

function canCancel(item: TransferItem): boolean {
  return item.status !== 'completed' && item.status !== 'cancelled' && item.status !== 'error';
}

export class TransferManager {
  private rtc: WebRTCManager;
  private callbacks: TransferManagerCallbacks = {};
  private queue: Map<string, TransferItem> = new Map();
  private chunkReaders: Map<string, ChunkReader> = new Map();
  private storageWriters: Map<string, StorageWriter> = new Map();
  private resumeManagers: Map<string, ResumeManager> = new Map();
  private backpressure: { channel: RTCDataChannel; controller: BackpressureController } | null = null;
  private writeQueues: Map<string, Promise<void>> = new Map();
  private receivedBytes: Map<string, number> = new Map();
  private activeSenders: Set<string> = new Set();
  private pendingAccepts = new Map<string, { receivedIndex: number; deadline: number }>();
  private acceptRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private outgoingControls = new Map<string, { message: ControlMessage; deadline: number; retryAt: number }>();
  private pendingSends = new Map<string, { index: number; deadline: number }>();
  private receiveActivity = new Map<string, { lastProgressAt: number; retryAt: number }>();
  private sessionGeneration = 0;

  // Leave room for the 36-byte framing header under common WebRTC message limits.
  private defaultChunkSize: number = 60 * 1024;
  private customChunkSize: boolean = false;
  private autoAccept: boolean = false;
  private speedTimer: any = null;
  private queueUpdateTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.customChunkSize = true;
  }

  public setAutoAccept(enabled: boolean) {
    this.autoAccept = enabled;
  }

  public isAutoAccept(): boolean {
    return this.autoAccept;
  }

  private lastProgressEmit: Map<string, number> = new Map();

  public getQueue(): TransferItem[] {
    return Array.from(this.queue.values());
  }

  private updateQueueItem(id: string, updates: Partial<TransferItem>, forceEmit: boolean = true) {
    const item = this.queue.get(id);
    if (item) {
      Object.assign(item, updates);
      const now = Date.now();
      const lastEmit = this.lastProgressEmit.get(id) || 0;

      if (forceEmit || now - lastEmit >= 100 || item.progress.percent >= 100) {
        this.lastProgressEmit.set(id, now);
        if (this.callbacks.onTransferProgress) {
          this.callbacks.onTransferProgress(item);
        }
        if (this.callbacks.onQueueUpdated) {
          if (forceEmit) {
            this.emitQueue();
          } else if (this.queueUpdateTimer === null) {
            this.queueUpdateTimer = setTimeout(() => this.emitQueue(), 100);
          }
        }
      }
    }
  }

  private emitQueue(): void {
    if (this.queueUpdateTimer !== null) clearTimeout(this.queueUpdateTimer);
    this.queueUpdateTimer = null;
    this.callbacks.onQueueUpdated?.(this.getQueue());
  }

  public resetSession(): void {
    this.sessionGeneration++;
    // A manual session leave must not permanently stop the speed timer or event listeners.
    for (const [id, item] of this.queue) {
      if (item.downloadUrl) URL.revokeObjectURL(item.downloadUrl);
      void this.storageWriters.get(id)?.abort();
      this.cleanup(id);
    }
    this.queue.clear();
    this.getBackpressure(null);
    this.lastBytesTransferred.clear();
    this.lastProgressEmit.clear();
    this.emitQueue();
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
      onFileChunk: (buffer) => this.handleIncomingChunk(buffer),
      onChannelReady: () => {
        this.flushPendingAccepts();
        this.retryTransfers();
      }
    });
  }

  /**
   * Sender API: Selects a file and initiates P2P upload.
   */
  public async offerFiles(entries: { file: File; relativePath: string }[], batchId: string): Promise<void> {
    const generation = this.sessionGeneration;
    let cursor = 0;
    const worker = async () => {
      while (generation === this.sessionGeneration && cursor < entries.length) {
        const { file, relativePath } = entries[cursor++];
        await this.offerFile(file, relativePath, batchId);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, entries.length) }, worker));
  }

  public async offerFile(file: File, relativePath?: string, batchId?: string): Promise<string> {
    const id = Math.random().toString(36).substring(2, 11);
    const chunkSize = this.customChunkSize
      ? this.defaultChunkSize
      : (this.rtc.getOptimalChunkSize?.() ?? this.defaultChunkSize);
    const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));

    const meta: TransferMeta = {
      id,
      name: file.name,
      relativePath: relativePath || file.name,
      batchId,
      size: file.size,
      type: file.type || 'application/octet-stream',
      totalChunks,
      chunkSize
    };
    const item: TransferItem = {
      ...meta,
      direction: 'upload',
      status: 'queued',
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
    this.emitQueue();

    try {
      meta.sha256 = await IntegrityManager.calculateFileHash(file);
    } catch (error) {
      if (this.queue.get(id) === item && item.status === 'queued') {
        console.error('Could not read selected file', error);
        this.failTransfer(id, `Could not read ${item.name}. Select the file again to retry.`);
      }
      return id;
    }

    if (this.queue.get(id) !== item || item.status !== 'queued') return id;
    this.chunkReaders.set(id, new ChunkReader(file, chunkSize));
    this.updateQueueItem(id, { status: 'offering', sha256: meta.sha256 });
    this.sendUntilAnswered(id, { type: 'FILE_OFFER', transferId: id, meta });
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
    for (const id of Array.from(this.queue.keys())) {
      this.cancelTransfer(id);
    }
  }

  /**
   * Receiver API: Accepts an incoming file offer.
   */
  public async acceptOffer(transferId: string, preferDirectSave: boolean = false): Promise<void> {
    const item = this.queue.get(transferId);
    if (item?.direction !== 'download' || item.status !== 'offering') return;

    this.updateQueueItem(transferId, { status: 'queued' });
    const isPending = () => {
      const current = this.queue.get(transferId);
      return current === item && current.status === 'queued';
    };
    let writer: StorageWriter | undefined;

    try {
      const storage = await StorageAdapter.createWriter(
        transferId,
        item.name,
        item.size,
        item.totalChunks,
        preferDirectSave
      );
      writer = storage.writer;
      if (!isPending()) return;

      const resumeMgr = new ResumeManager(transferId, item.totalChunks);
      await resumeMgr.initFromStorage();
      if (!isPending()) return;

      this.storageWriters.set(transferId, writer);
      writer = undefined;
      this.resumeManagers.set(transferId, resumeMgr);
      this.receivedBytes.set(transferId, resumeMgr.getReceivedCount() * item.chunkSize);
      this.pendingAccepts.set(transferId, {
        receivedIndex: resumeMgr.getFirstMissingChunkIndex(),
        deadline: Date.now() + ACCEPT_RETRY_WINDOW_MS
      });
    } catch (error) {
      if (isPending()) {
        const message = error instanceof Error ? error.message : 'Unable to prepare the file download.';
        this.failTransfer(transferId, message);
      }
      return;
    } finally {
      // The session may have ended while the writer was opening.
      void writer?.abort().catch(console.error);
    }

    if (this.acceptRetryTimer === null) this.flushPendingAccepts();
  }

  private flushPendingAccepts(): void {
    if (this.acceptRetryTimer !== null) {
      clearTimeout(this.acceptRetryTimer);
      this.acceptRetryTimer = null;
    }

    let canSend = this.pendingAccepts.size > 0 && this.rtc.areChannelsOpen();
    for (const [transferId, pending] of this.pendingAccepts) {
      canSend = canSend && this.rtc.sendControlMessage({
        type: 'FILE_ACCEPT', transferId, receivedIndex: pending.receivedIndex
      });
      if (canSend) {
        this.pendingAccepts.delete(transferId);
        this.recordReceiveProgress(transferId);
        this.updateQueueItem(transferId, { status: 'transferring', startTime: Date.now() });
      } else if (Date.now() >= pending.deadline) {
        this.failTransfer(transferId, 'The peer connection did not recover. Ask the sender to resend the file.');
      }
    }

    // A relay socket can open before the session is restored and able to send.
    if (this.pendingAccepts.size > 0) {
      this.acceptRetryTimer = setTimeout(() => this.flushPendingAccepts(), ACCEPT_RETRY_INTERVAL_MS);
    }
  }

  private failTransfer(transferId: string, message: string): void {
    void this.storageWriters.get(transferId)?.abort().catch(console.error);
    this.cleanup(transferId);
    this.updateQueueItem(transferId, { status: 'error', error: message });
    this.callbacks.onError?.(transferId, message);
  }

  private sendUntilAnswered(transferId: string, message: ControlMessage): void {
    const now = Date.now();
    const pending = { message, deadline: now + TRANSFER_RETRY_WINDOW_MS, retryAt: now };
    this.outgoingControls.set(transferId, pending);
    this.retryOutgoingControl(transferId, pending, now);
  }

  private retryOutgoingControl(
    id: string,
    pending: { message: ControlMessage; deadline: number; retryAt: number },
    now: number
  ): void {
    if (this.queue.get(id)?.status === 'paused') return;

    if (now >= pending.deadline) {
      const error = pending.message.type === 'FILE_OFFER'
        ? 'The peer did not accept this file. Send it again after reconnecting.'
        : 'The peer did not confirm receipt. Check the file on the receiving device.';
      this.failTransfer(id, error);
    } else if (now >= pending.retryAt && this.rtc.areChannelsOpen()) {
      const sent = this.rtc.sendControlMessage(pending.message);
      pending.retryAt = now + (sent ? TRANSFER_RETRY_INTERVAL_MS : ACCEPT_RETRY_INTERVAL_MS);
    }
  }

  private queueSend(id: string, index: number): void {
    this.outgoingControls.delete(id);
    this.pendingSends.set(id, { index, deadline: Date.now() + TRANSFER_RETRY_WINDOW_MS });
    this.startPendingSend(id);
  }

  private startPendingSend(id: string): void {
    const pending = this.pendingSends.get(id);
    if (!pending || this.activeSenders.has(id) || this.queue.get(id)?.status !== 'transferring') return;

    if (Date.now() >= pending.deadline) {
      this.failTransfer(id, 'The file channel did not recover. Send the file again after reconnecting.');
    } else if (this.rtc.areChannelsOpen()) {
      this.pendingSends.delete(id);
      void this.startSendingChunks(id, pending.index, pending.deadline);
    }
  }

  private recordReceiveProgress(id: string): void {
    const now = Date.now();
    this.receiveActivity.set(id, { lastProgressAt: now, retryAt: now + TRANSFER_RETRY_INTERVAL_MS });
  }

  private retryTransfers(): void {
    const now = Date.now();
    for (const [id, pending] of this.outgoingControls) this.retryOutgoingControl(id, pending, now);
    for (const id of this.pendingSends.keys()) this.startPendingSend(id);

    for (const [id, activity] of this.receiveActivity) {
      if (this.queue.get(id)?.status !== 'transferring' || this.writeQueues.has(id)) continue;
      if (now - activity.lastProgressAt >= TRANSFER_RETRY_WINDOW_MS) {
        this.failTransfer(id, 'The download stopped before all bytes arrived. Ask the sender to resend the file.');
        this.rtc.sendControlMessage({ type: 'CANCEL_TRANSFER', transferId: id });
      } else if (now >= activity.retryAt && this.rtc.areChannelsOpen()) {
        const receivedIndex = this.resumeManagers.get(id)?.getFirstMissingChunkIndex();
        this.rtc.sendControlMessage({ type: 'RESUME_REQ', transferId: id, receivedIndex });
        activity.retryAt = now + TRANSFER_RETRY_INTERVAL_MS;
      }
    }
  }

  /**
   * Receiver API: Rejects an incoming file offer.
   */
  public rejectOffer(transferId: string): void {
    const item = this.queue.get(transferId);
    if (item?.direction === 'download' && item.status === 'offering') {
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
      const receivedIndex = this.resumeManagers.get(transferId)?.getFirstMissingChunkIndex();
      this.rtc.sendControlMessage({ type: 'RESUME_TRANSFER', transferId, receivedIndex });

      if (item.direction === 'upload') {
        this.queueSend(transferId, item.progress.chunksTransferred);
      } else {
        this.recordReceiveProgress(transferId);
      }
    }
  }

  public cancelTransfer(transferId: string): void {
    const item = this.queue.get(transferId);
    if (item && canCancel(item)) {
      this.updateQueueItem(transferId, { status: 'cancelled' });
      this.rtc.sendControlMessage({ type: 'CANCEL_TRANSFER', transferId });
      void this.storageWriters.get(transferId)?.abort();
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
        const existing = this.queue.get(msg.transferId);
        if (existing) {
          if (existing.direction === 'download' && existing.status === 'transferring') {
            const receivedIndex = this.resumeManagers.get(msg.transferId)?.getFirstMissingChunkIndex();
            this.rtc.sendControlMessage({ type: 'FILE_ACCEPT', transferId: msg.transferId, receivedIndex });
          }
          return;
        }
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
        this.emitQueue();
        if (this.callbacks.onOfferReceived) this.callbacks.onOfferReceived(item);

        if (this.autoAccept) {
          this.acceptOffer(msg.transferId);
        }
        break;
      }

      case 'FILE_ACCEPT':
      case 'RESUME_REQ': {
        const item = this.queue.get(msg.transferId);
        if (item?.direction !== 'upload') break;
        const isNewAcceptance = item.status === 'offering';
        const canResend = msg.type === 'RESUME_REQ' && item.status === 'transferring';
        const index = msg.receivedIndex ?? 0;
        if ((!isNewAcceptance && !canResend) || !Number.isInteger(index) || index < 0 || index > item.totalChunks) break;

        if (isNewAcceptance) this.updateQueueItem(msg.transferId, { status: 'transferring', startTime: Date.now() });
        this.queueSend(msg.transferId, index);
        break;
      }

      case 'FILE_REJECT': {
        const item = this.queue.get(msg.transferId);
        if (item?.direction === 'upload' && item.status === 'offering') {
          this.updateQueueItem(msg.transferId, { status: 'cancelled', error: 'Receiver declined file transfer' });
          this.cleanup(msg.transferId);
        }
        break;
      }

      case 'PAUSE_TRANSFER': {
        if (this.queue.get(msg.transferId)?.status === 'transferring') {
          this.updateQueueItem(msg.transferId, { status: 'paused' });
        }
        break;
      }

      case 'RESUME_TRANSFER': {
        const item = this.queue.get(msg.transferId);
        if (item?.status === 'paused') {
          this.updateQueueItem(msg.transferId, { status: 'transferring' });
          if (item.direction === 'upload') {
            const index = msg.receivedIndex ?? item.progress.chunksTransferred;
            if (Number.isInteger(index) && index >= 0 && index <= item.totalChunks) this.queueSend(msg.transferId, index);
          } else {
            this.recordReceiveProgress(msg.transferId);
          }
        }
        break;
      }

      case 'CANCEL_TRANSFER': {
        const item = this.queue.get(msg.transferId);
        if (!item || !canCancel(item)) break;
        this.updateQueueItem(msg.transferId, { status: 'cancelled', error: 'Transfer cancelled by peer' });
        void this.storageWriters.get(msg.transferId)?.abort();
        this.cleanup(msg.transferId);
        break;
      }

      case 'TRANSFER_COMPLETE': {
        const item = this.queue.get(msg.transferId);
        if (item?.direction === 'download' && item.status === 'completed') {
          this.rtc.sendControlMessage({ type: 'VERIFICATION_RESULT', transferId: msg.transferId, verified: item.verified });
        }
        break;
      }

      case 'VERIFICATION_RESULT': {
        const item = this.queue.get(msg.transferId);
        if (item?.direction === 'upload' && (item.status === 'transferring' || item.status === 'paused')) {
          if (!msg.verified) {
            this.failTransfer(msg.transferId, 'The received file did not pass its integrity check. Send the file again.');
            break;
          }
          this.updateQueueItem(msg.transferId, {
            status: 'completed',
            verified: true,
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
   * Sender: Chunk loop with backpressure and reconnect handling.
   */
  private getBackpressure(channel: RTCDataChannel | null): BackpressureController | null {
    if (this.backpressure?.channel === channel) return this.backpressure.controller;
    this.backpressure?.controller.destroy();
    this.backpressure = channel ? { channel, controller: new BackpressureController(channel) } : null;
    return this.backpressure?.controller ?? null;
  }

  private async startSendingChunks(transferId: string, startIndex: number, deadline: number) {
    const item = this.queue.get(transferId);
    const chunkReader = this.chunkReaders.get(transferId);
    if (!item || !chunkReader) return;

    this.activeSenders.add(transferId);
    const canContinue = () => this.queue.get(transferId) === item &&
      item.status === 'transferring' && !this.pendingSends.has(transferId);

    try {
      const totalChunks = chunkReader.getTotalChunks();
      // Latch read errors so a cancelled transfer cannot leave a rejected prefetch behind.
      const readChunk = (index: number) => chunkReader.readChunk(index).then(
        (chunk) => ({ chunk }),
        (error: unknown) => ({ error })
      );
      let nextRead = startIndex < totalChunks ? readChunk(startIndex) : null;

      for (let index = startIndex; nextRead !== null; index++) {
        if (!canContinue()) return;
        const result = await nextRead;
        if (!canContinue()) return;
        if ('error' in result) throw result.error;
        const { chunk } = result;
        nextRead = index + 1 < totalChunks ? readChunk(index + 1) : null;

        while (canContinue() && this.rtc.areChannelsOpen()) {
          if (this.rtc.isWebSocketRelayMode) {
            if (this.rtc.getRelayBufferedAmount() <= 1024 * 1024) break;
            await new Promise((r) => setTimeout(r, 15));
          } else {
            const controller = this.getBackpressure(this.rtc.fileChannel);
            if (!controller?.isBuffered()) break;
            await controller.waitIfBuffered();
          }
        }
        if (!canContinue()) return;

        const packetBuffer = TransferProtocol.encodePacket(
          transferId,
          chunk.chunkIndex,
          chunk.offset,
          chunk.buffer
        );

        if (!this.rtc.areChannelsOpen() || !this.rtc.sendFileChunk(packetBuffer)) {
          this.pendingSends.set(transferId, { index, deadline });
          return;
        }

        deadline = Date.now() + TRANSFER_RETRY_WINDOW_MS;
        const bytesTransferred = Number(chunk.offset) + chunk.length;
        const percent = item.size > 0
          ? Math.min(100, Math.round((bytesTransferred / item.size) * 100))
          : 100;

        this.updateQueueItem(transferId, {
          progress: {
            ...item.progress,
            bytesTransferred,
            chunksTransferred: index + 1,
            percent
          }
        }, false);
      }
      if (canContinue()) {
        this.sendUntilAnswered(transferId, { type: 'TRANSFER_COMPLETE', transferId });
      }
    } catch (error) {
      if (this.queue.get(transferId) === item && (item.status === 'transferring' || item.status === 'paused')) {
        console.error(`Error sending chunks for ${transferId}`, error);
        this.failTransfer(transferId, `Could not send ${item.name}. Select the file again to retry.`);
        this.rtc.sendControlMessage({ type: 'CANCEL_TRANSFER', transferId });
      }
    } finally {
      this.activeSenders.delete(transferId);
    }
  }

  /**
   * Receiver: Handle incoming framed binary chunk packet sequentially per transfer
   */
  private handleIncomingChunk(buffer: ArrayBuffer): void {
    let packet: ReturnType<typeof TransferProtocol.decodePacket>;
    try {
      packet = TransferProtocol.decodePacket(buffer);
    } catch (e) {
      console.error('Error decoding incoming file chunk', e);
      return;
    }

    const { transferId } = packet;
    const prevQueue = this.writeQueues.get(transferId) ?? Promise.resolve();
    const nextQueue = prevQueue
      .then(() => this.processIncomingPacket(packet))
      .catch((e: unknown) => {
        console.error('Error handling incoming file chunk', e);
        const status = this.queue.get(transferId)?.status;
        if (status === 'transferring' || status === 'paused' || status === 'verifying') {
          const message = e instanceof Error ? e.message : 'Unable to write incoming file data.';
          this.failTransfer(transferId, message);
          this.rtc.sendControlMessage({ type: 'CANCEL_TRANSFER', transferId });
        }
      })
      .finally(() => {
        if (this.writeQueues.get(transferId) === nextQueue) this.writeQueues.delete(transferId);
      });
    this.writeQueues.set(transferId, nextQueue);
  }

  private async processIncomingPacket(packet: ReturnType<typeof TransferProtocol.decodePacket>): Promise<void> {
    const { transferId, chunkIndex, offset, payload } = packet;
    const item = this.queue.get(transferId);
    const writer = this.storageWriters.get(transferId);
    const resumeMgr = this.resumeManagers.get(transferId);

    if (!item || !writer || !resumeMgr || (item.status !== 'transferring' && item.status !== 'paused')) return;

    const expectedOffset = BigInt(chunkIndex) * BigInt(item.chunkSize);
    const expectedLength = Math.min(item.chunkSize, item.size - Number(expectedOffset));
    if (chunkIndex >= item.totalChunks || offset !== expectedOffset || payload.byteLength !== expectedLength) return;

    const alreadyHad = resumeMgr.hasChunk(chunkIndex);
    if (!alreadyHad) {
      await writer.writeChunk(chunkIndex, offset, payload);
      if (this.storageWriters.get(transferId) !== writer) return;
      await resumeMgr.markChunkReceived(chunkIndex);
      if (this.storageWriters.get(transferId) !== writer) return;
      const nextBytes = Math.min(item.size, (this.receivedBytes.get(transferId) || 0) + payload.byteLength);
      this.receivedBytes.set(transferId, nextBytes);
      this.recordReceiveProgress(transferId);
    }

    const bytesTransferred = this.receivedBytes.get(transferId) || 0;
    const percent = item.size > 0
      ? Math.min(100, Math.round((bytesTransferred / item.size) * 100))
      : 100;

    this.updateQueueItem(transferId, {
      progress: {
        ...item.progress,
        bytesTransferred,
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
        const computedHash = await IntegrityManager.calculateFileHash(
          new File([blobOrResult], item.name, { type: item.type })
        );
        verified = blobOrResult.size === item.size && (!item.sha256 || IntegrityManager.verifyHash(computedHash, item.sha256));
      } else {
        // Direct FS file written directly to user disk
        verified = true;
      }
      if (this.storageWriters.get(transferId) !== writer) return;

      if (!verified) {
        this.rtc.sendControlMessage({ type: 'VERIFICATION_RESULT', transferId, verified: false });
        await resumeMgr.clear();
        if (this.storageWriters.get(transferId) === writer) {
          this.failTransfer(transferId, 'The received file is incomplete or damaged. Ask the sender to resend it.');
        }
        return;
      }
      const downloadBlob = blobOrResult instanceof Blob ? blobOrResult : undefined;
      if (downloadBlob) downloadUrl = URL.createObjectURL(downloadBlob);

      this.updateQueueItem(transferId, {
        status: 'completed',
        verified,
        downloadUrl: downloadUrl || undefined,
        downloadBlob,
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

      try {
        await resumeMgr.clear();
      } finally {
        if (this.storageWriters.get(transferId) === writer) this.cleanup(transferId);
      }
    }
  }

  /**
   * Calculates rolling transfer speed (bytes/sec) and ETA (seconds remaining)
   */
  private startSpeedCalculation() {
    this.speedTimer = setInterval(() => {
      this.retryTransfers();
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
              }, false);
            }
          }
          this.lastBytesTransferred.set(id, { bytes: item.progress.bytesTransferred, timestamp: now });
        }
      });
    }, 1000);
  }

  private cleanup(transferId: string) {
    this.outgoingControls.delete(transferId);
    this.pendingSends.delete(transferId);
    this.receiveActivity.delete(transferId);
    this.pendingAccepts.delete(transferId);
    if (this.pendingAccepts.size === 0 && this.acceptRetryTimer !== null) {
      clearTimeout(this.acceptRetryTimer);
      this.acceptRetryTimer = null;
    }
    this.chunkReaders.delete(transferId);
    this.storageWriters.delete(transferId);
    this.resumeManagers.delete(transferId);
    this.lastBytesTransferred.delete(transferId);
    this.writeQueues.delete(transferId);
    this.receivedBytes.delete(transferId);
  }
}
