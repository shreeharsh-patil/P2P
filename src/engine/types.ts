export type TransferStatus = 
  | 'queued'
  | 'offering'
  | 'transferring'
  | 'paused'
  | 'verifying'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface TransferMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
  chunkSize: number;
  sha256?: string;
  lastModified?: number;
}

export interface TransferProgress {
  bytesTransferred: number;
  chunksTransferred: number;
  speed: number; // bytes per second
  eta: number; // seconds remaining
  percent: number; // 0 to 100
}

export interface TransferItem extends TransferMeta {
  direction: 'upload' | 'download';
  status: TransferStatus;
  progress: TransferProgress;
  error?: string;
  verified?: boolean;
  downloadUrl?: string;
  receivedChunksBitset?: Set<number>;
  startTime?: number;
  endTime?: number;
  file?: File; // Present for uploads
}

// Control Channel Protocol Messages
export type ControlMessageType = 
  | 'FILE_OFFER'
  | 'FILE_ACCEPT'
  | 'FILE_REJECT'
  | 'CHUNK_ACK'
  | 'RESUME_REQ'
  | 'PAUSE_TRANSFER'
  | 'RESUME_TRANSFER'
  | 'CANCEL_TRANSFER'
  | 'TRANSFER_COMPLETE'
  | 'VERIFICATION_RESULT'
  | 'TEXT_MESSAGE';

export interface ControlMessage {
  type: ControlMessageType;
  transferId?: string;
  meta?: TransferMeta;
  receivedIndex?: number;
  receivedBitset?: number[]; // list or array of missing/received chunk indices
  resumeOffset?: number;
  sha256?: string;
  verified?: boolean;
  textPayload?: string;
  timestamp?: number;
  reason?: string;
}
