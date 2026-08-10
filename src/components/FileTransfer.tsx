import React, { useRef, useState } from 'react';
import { 
  UploadCloud, File, FileText, Image, Video, Music, Archive, 
  Pause, Play, X, ShieldCheck, AlertCircle, Download, Eye
} from 'lucide-react';
import { TransferItem } from '../engine/types';
import { formatBytes, formatTimeRemaining, truncateFileName } from '../utils/formatters';
import { StatusIndicator, StatusKind } from './StatusIndicator';
import { FilePreviewModal } from './FilePreviewModal';

interface FileTransferProps {
  queue: TransferItem[];
  canTransfer: boolean;
  onOfferFiles: (files: FileList | File[]) => void;
  onAcceptOffer: (id: string) => void;
  onRejectOffer: (id: string) => void;
  onPauseTransfer: (id: string) => void;
  onResumeTransfer: (id: string) => void;
  onCancelTransfer: (id: string) => void;
}

const getFileIcon = (type: string) => {
  if (type.startsWith('image/')) return <Image className="w-4 h-4 text-[#ff2b2b]" />;
  if (type.startsWith('video/')) return <Video className="w-4 h-4 text-[#ff2b2b]" />;
  if (type.startsWith('audio/')) return <Music className="w-4 h-4 text-[#ff2b2b]" />;
  if (type.includes('pdf') || type.includes('text')) return <FileText className="w-4 h-4 text-[#ff2b2b]" />;
  if (type.includes('zip') || type.includes('tar') || type.includes('rar')) return <Archive className="w-4 h-4 text-[#ff2b2b]" />;
  return <File className="w-4 h-4 text-[#ff2b2b]" />;
};

const statusKindFor = (item: TransferItem): StatusKind => {
  switch (item.status) {
    case 'offering':
      return item.direction === 'download' ? 'incoming' : 'waiting';
    case 'transferring':
      return 'transferring';
    case 'paused':
      return 'paused';
    case 'verifying':
      return 'verifying';
    case 'completed':
      return 'completed';
    case 'error':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'waiting';
  }
};

export const FileTransfer: React.FC<FileTransferProps> = ({
  queue,
  canTransfer,
  onOfferFiles,
  onAcceptOffer,
  onRejectOffer,
  onPauseTransfer,
  onResumeTransfer,
  onCancelTransfer
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewItem, setPreviewItem] = useState<TransferItem | null>(null);

  const openFilePicker = () => {
    if (canTransfer && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    if (canTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onOfferFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onOfferFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDownloadClick = (url: string, name: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const showProgress = (item: TransferItem) =>
    item.status === 'transferring' || item.status === 'paused' || item.status === 'verifying';

  return (
    <div className="w-full space-y-8 animate-fade-in-up">
      {/* DROP ZONE */}
      <div
        onClick={openFilePicker}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border border-dashed rounded-md transition-all duration-200 text-center select-none ${
          !canTransfer
            ? 'border-[#1c1c22] bg-[#08080a]'
            : isDragOver
            ? 'border-[#ff2b2b] bg-[#150a0c] shadow-[0_0_35px_rgba(255,43,43,0.22)] animate-glow-pulse'
            : 'border-[#2a2a32] bg-[#0a0a0c] hover:border-[#ff2b2b]/70 hover:bg-[#0c0c0f] cursor-pointer'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          className="hidden"
          tabIndex={-1}
        />

        <div className="py-16 sm:py-20 px-6 flex flex-col items-center justify-center space-y-6">
          <div
            className={`w-14 h-14 rounded-sm border flex items-center justify-center transition-colors ${
              isDragOver
                ? 'border-[#ff2b2b] bg-[#ff2b2b]/10 text-[#ff2b2b]'
                : canTransfer
                ? 'border-[#ff2b2b]/40 bg-[#180a0c] text-[#ff2b2b]'
                : 'border-[#26262e] bg-[#0c0c0e] text-[#4a4a4a]'
            }`}
          >
            <UploadCloud className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h3 className="font-mono font-bold text-lg sm:text-xl tracking-wide text-[#f2f2f2]">
              {!canTransfer
                ? 'INITIALIZING DATA CHANNEL'
                : isDragOver
                ? 'READY TO TRANSFER'
                : 'DROP FILES HERE'}
            </h3>
            <p className="text-xs text-[#8a8a8a] font-sans">
              {!canTransfer
                ? 'Preparing WebRTC P2P DataChannel connection...'
                : isDragOver
                ? 'Release file to start P2P stream'
                : 'or choose files from your device'}
            </p>
          </div>

          <button
            type="button"
            disabled={!canTransfer}
            onClick={(e) => {
              e.stopPropagation();
              openFilePicker();
            }}
            className={`px-6 py-2.5 text-xs font-mono font-bold tracking-[0.2em] uppercase rounded-sm transition-all active:scale-95 ${
              canTransfer
                ? 'bg-[#ff2b2b] text-white hover:bg-[#e51b23] shadow-[0_0_18px_rgba(255,43,43,0.35)] hover:shadow-[0_0_25px_rgba(255,43,43,0.5)]'
                : 'bg-[#141418] text-[#4a4a4a] cursor-not-allowed'
            }`}
          >
            Upload Files
          </button>
        </div>
      </div>

      {/* TRANSFERS */}
      <div className="space-y-4 font-mono">
        <div className="text-xs text-[#8a8a8a] tracking-[0.25em] uppercase flex items-center justify-between">
          <span>// TRANSFERS ({queue.length})</span>
        </div>

        {queue.length === 0 ? (
          <div className="tech-panel p-6 bg-[#09090b] border border-[#1c1c22] text-center text-xs text-[#4a4a4a]">
            NO ACTIVE TRANSFERS — Files you send or receive will appear here.
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((item) => (
              <div key={item.id} className="tech-panel p-4 bg-[#09090b] border border-[#1c1c22] space-y-3 animate-fade-in-up">
                {/* Header: name / size / actions */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-[#050505] border border-[#18181c] rounded-sm flex-shrink-0">
                      {getFileIcon(item.type)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-mono font-bold text-sm text-[#f2f2f2] truncate" title={item.name}>
                        {truncateFileName(item.name, 40)}
                      </h4>
                      <div className="text-[11px] text-[#8a8a8a] font-mono mt-0.5">
                        {formatBytes(item.size)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Incoming offer actions */}
                    {item.status === 'offering' && item.direction === 'download' && (
                      <>
                        <button
                          onClick={() => onAcceptOffer(item.id)}
                          className="px-3 py-1.5 text-[11px] font-mono font-bold bg-[#ff2b2b] hover:bg-[#e51b23] text-white rounded-sm transition-colors active:scale-95"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => onRejectOffer(item.id)}
                          className="px-3 py-1.5 text-[11px] font-mono bg-[#141418] hover:bg-[#1a1a20] text-[#8a8a8a] border border-[#26262e] rounded-sm transition-colors active:scale-95"
                        >
                          Decline
                        </button>
                      </>
                    )}

                    {/* Download completed actions */}
                    {item.status === 'completed' && item.downloadUrl && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPreviewItem(item)}
                          className="px-3 py-1.5 text-[11px] font-mono text-[#aaa] border border-[#333] hover:border-[#ff2b2b] hover:text-white rounded-sm transition-colors flex items-center gap-1 active:scale-95"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#ff2b2b]" />
                          Preview
                        </button>
                        <button
                          onClick={() => handleDownloadClick(item.downloadUrl!, item.name)}
                          className="px-3 py-1.5 text-[11px] font-mono font-bold bg-[#ff2b2b] hover:bg-[#e51b23] text-white rounded-sm transition-colors flex items-center gap-1.5 active:scale-95 shadow-[0_0_12px_rgba(255,48,48,0.3)]"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Save File
                        </button>
                      </div>
                    )}

                    {/* Active transfer controls */}
                    {(item.status === 'transferring' || item.status === 'paused') && (
                      <div className="flex items-center gap-1">
                        {item.status === 'transferring' ? (
                          <button
                            onClick={() => onPauseTransfer(item.id)}
                            className="p-1.5 text-[#8a8a8a] hover:text-[#f2f2f2] hover:bg-[#141418] rounded-sm transition-colors"
                            title="Pause"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => onResumeTransfer(item.id)}
                            className="p-1.5 text-[#ff2b2b] hover:bg-[#141418] rounded-sm transition-colors"
                            title="Resume"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => onCancelTransfer(item.id)}
                          className="p-1.5 text-[#8a8a8a] hover:text-rose-400 hover:bg-[#141418] rounded-sm transition-colors"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Progress */}
                {showProgress(item) && (
                  <div className="space-y-2">
                    <div className="w-full h-1.5 bg-[#0a0a0c] border border-[#18181c] rounded-sm overflow-hidden">
                      <div
                        className={`h-full bg-[#ff2b2b] shadow-[0_0_8px_#ff2b2b] transition-all duration-200 ${
                          item.status === 'transferring' ? 'animate-striped-progress' : ''
                        }`}
                        style={{ width: `${item.progress.percent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-[#8a8a8a]">
                      <span>
                        {formatBytes(item.progress.bytesTransferred)} / {formatBytes(item.size)}
                      </span>
                      <span>
                        {item.progress.speed > 0 ? `${formatBytes(item.progress.speed)}/s` : 'Calculating...'}
                        {item.status !== 'paused' && item.progress.eta > 0
                          ? ` · ${formatTimeRemaining(item.progress.eta)} left`
                          : ''}
                      </span>
                    </div>
                  </div>
                )}

                {/* Status row */}
                <div className="flex items-center justify-between gap-3 pt-0.5">
                  <StatusIndicator status={statusKindFor(item)} size="sm" />

                  {item.status === 'completed' && item.verified && (
                    <span className="text-[10px] font-mono text-emerald-400/80 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      SHA-256 VERIFIED
                    </span>
                  )}

                  {item.status === 'error' && (
                    <span className="text-[10px] font-mono text-rose-400/90 flex items-center gap-1 truncate">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{item.error || 'Transfer failed'}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      <FilePreviewModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
      />
    </div>
  );
};
