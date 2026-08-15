import React, { useRef, useState, useMemo } from 'react';
import { 
  UploadCloud, File, FileText, Image, Video, Music, Archive, 
  Pause, Play, X, ShieldCheck, AlertCircle, Download, Eye,
  Folder, FolderUp, CheckCheck, Package, Layers, XCircle, FileCheck, Zap
} from 'lucide-react';
import { TransferItem } from '../engine/types';
import { formatBytes, formatTimeRemaining, truncateFileName } from '../utils/formatters';
import { StatusIndicator, StatusKind } from './StatusIndicator';
import { FilePreviewModal } from './FilePreviewModal';
import { scanDataTransferItems, extractFromFolderInput, ScannedFile } from '../utils/directoryReader';
import { ZipStreamer } from '../utils/zipStreamer';
import { CryptoEngine } from '../engine/CryptoEngine';

interface FileTransferProps {
  queue: TransferItem[];
  canTransfer: boolean;
  autoAcceptFiles?: boolean;
  onToggleAutoAccept?: () => void;
  onOfferFiles: (files: FileList | File[]) => void;
  onOfferScannedFiles?: (files: ScannedFile[]) => void;
  onAcceptOffer: (id: string) => void;
  onRejectOffer: (id: string) => void;
  onAcceptAllOffers?: () => void;
  onRejectAllOffers?: () => void;
  onPauseAll?: () => void;
  onResumeAll?: () => void;
  onCancelAll?: () => void;
  onPauseTransfer: (id: string) => void;
  onResumeTransfer: (id: string) => void;
  onCancelTransfer: (id: string) => void;
}

type FilterTab = 'all' | 'active' | 'completed' | 'pending';

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
  autoAcceptFiles = false,
  onToggleAutoAccept,
  onOfferFiles,
  onOfferScannedFiles,
  onAcceptOffer,
  onRejectOffer,
  onAcceptAllOffers,
  onRejectAllOffers,
  onPauseAll,
  onResumeAll,
  onCancelAll,
  onPauseTransfer,
  onResumeTransfer,
  onCancelTransfer
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewItem, setPreviewItem] = useState<TransferItem | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [isZipping, setIsZipping] = useState(false);

  const openFilePicker = () => {
    if (canTransfer && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const openFolderPicker = () => {
    if (canTransfer && folderInputRef.current) {
      folderInputRef.current.click();
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    if (!canTransfer) return;

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const scanned = await scanDataTransferItems(e.dataTransfer.items);
      if (scanned.length > 0) {
        if (onOfferScannedFiles) {
          onOfferScannedFiles(scanned);
        } else {
          onOfferFiles(scanned.map((s) => s.file));
        }
        return;
      }
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onOfferFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onOfferFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const scanned = extractFromFolderInput(e.target.files);
      if (onOfferScannedFiles) {
        onOfferScannedFiles(scanned);
      } else {
        onOfferFiles(e.target.files);
      }
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

  // Download Cryptographic Transfer Receipt (Signed JSON Certificate)
  const handleDownloadReceipt = async (item: TransferItem) => {
    try {
      const receipt = await CryptoEngine.generateReceipt({
        transferId: item.id,
        fileName: item.name,
        fileSize: item.size,
        sha256: item.sha256 || 'N/A',
        senderPeerId: item.direction === 'upload' ? 'Local-Device' : 'Remote-Peer',
        receiverPeerId: item.direction === 'download' ? 'Local-Device' : 'Remote-Peer',
        timestamp: item.endTime || Date.now(),
        durationMs: (item.endTime && item.startTime) ? item.endTime - item.startTime : 1000,
        averageSpeedBytesPerSec: item.progress.speed || Math.round(item.size / 2),
        encryptionMode: 'ECDH_AES_GCM_256'
      });

      const receiptBlob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
      const receiptUrl = URL.createObjectURL(receiptBlob);
      handleDownloadClick(receiptUrl, `receipt_${item.name.replace(/\.[^/.]+$/, '')}.json`);
      setTimeout(() => URL.revokeObjectURL(receiptUrl), 10000);
    } catch (err) {
      console.error('Failed to generate receipt', err);
    }
  };

  // Download all completed items as a structured ZIP archive
  const handleDownloadAllAsZip = async () => {
    const completedItems = queue.filter((item) => item.status === 'completed');
    if (completedItems.length === 0 || isZipping) return;

    setIsZipping(true);
    try {
      const zipEntries: { name: string; data: Blob }[] = [];

      for (const item of completedItems) {
        if (item.downloadUrl) {
          const resp = await fetch(item.downloadUrl);
          const blob = await resp.blob();
          const entryPath = item.relativePath || item.name;
          zipEntries.push({ name: entryPath, data: blob });
        } else if (item.file) {
          const entryPath = item.relativePath || item.name;
          zipEntries.push({ name: entryPath, data: item.file });
        }
      }

      if (zipEntries.length > 0) {
        const zipBlob = await ZipStreamer.createZip(zipEntries);
        const zipUrl = URL.createObjectURL(zipBlob);
        const zipName = `shree_bundle_${new Date().toISOString().slice(0, 10)}.zip`;
        handleDownloadClick(zipUrl, zipName);
        setTimeout(() => URL.revokeObjectURL(zipUrl), 30000);
      }
    } catch (err) {
      console.error('Failed to create ZIP bundle', err);
    } finally {
      setIsZipping(false);
    }
  };

  // Aggregated Queue Metrics
  const metrics = useMemo(() => {
    const total = queue.length;
    const completed = queue.filter((i) => i.status === 'completed').length;
    const active = queue.filter((i) => i.status === 'transferring').length;
    const paused = queue.filter((i) => i.status === 'paused').length;
    const incomingOffers = queue.filter((i) => i.status === 'offering' && i.direction === 'download').length;
    const pendingOffers = queue.filter((i) => i.status === 'offering').length;

    const totalBytes = queue.reduce((acc, i) => acc + i.size, 0);
    const transferredBytes = queue.reduce((acc, i) => acc + i.progress.bytesTransferred, 0);
    const totalSpeed = queue
      .filter((i) => i.status === 'transferring')
      .reduce((acc, i) => acc + (i.progress.speed || 0), 0);

    const overallPercent = totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 0;
    const remainingBytes = Math.max(0, totalBytes - transferredBytes);
    const overallEta = totalSpeed > 0 ? Math.ceil(remainingBytes / totalSpeed) : 0;

    return {
      total,
      completed,
      active,
      paused,
      incomingOffers,
      pendingOffers,
      totalBytes,
      transferredBytes,
      totalSpeed,
      overallPercent,
      overallEta
    };
  }, [queue]);

  const filteredQueue = useMemo(() => {
    switch (activeTab) {
      case 'active':
        return queue.filter((i) => i.status === 'transferring' || i.status === 'paused' || i.status === 'verifying');
      case 'completed':
        return queue.filter((i) => i.status === 'completed');
      case 'pending':
        return queue.filter((i) => i.status === 'offering' || i.status === 'queued');
      default:
        return queue;
    }
  }, [queue, activeTab]);

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
        <input
          type="file"
          ref={folderInputRef}
          onChange={handleFolderSelect}
          // @ts-expect-error webkitdirectory is non-standard but supported in all modern browsers
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          tabIndex={-1}
        />

        <div className="py-14 sm:py-16 px-6 flex flex-col items-center justify-center space-y-5">
          <div
            className={`w-14 h-14 rounded-sm border flex items-center justify-center transition-colors ${
              isDragOver
                ? 'border-[#ff2b2b] bg-[#ff2b2b]/10 text-[#ff2b2b]'
                : canTransfer
                ? 'border-[#ff2b2b]/40 bg-[#180a0c] text-[#ff2b2b]'
                : 'border-[#26262e] bg-[#0c0c0e] text-[#4a4a4a]'
            }`}
          >
            {isDragOver ? <Folder className="w-7 h-7 animate-bounce" /> : <UploadCloud className="w-7 h-7" />}
          </div>

          <div className="space-y-1.5">
            <h3 className="font-mono font-bold text-lg sm:text-xl tracking-wide text-[#f2f2f2]">
              {!canTransfer
                ? 'INITIALIZING DATA CHANNEL'
                : isDragOver
                ? 'DROP FILES OR FOLDERS HERE'
                : 'DRAG & DROP FILES OR DIRECTORIES'}
            </h3>
            <p className="text-xs text-[#8a8a8a] font-sans">
              {!canTransfer
                ? 'Preparing WebRTC P2P DataChannel connection...'
                : isDragOver
                ? 'Release to stream entire directory tree or files'
                : 'Fast P2P streaming with automatic directory hierarchy & adaptive chunking'}
            </p>
          </div>

          {/* ACTIONS */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              disabled={!canTransfer}
              onClick={(e) => {
                e.stopPropagation();
                openFilePicker();
              }}
              className={`px-5 py-2.5 text-xs font-mono font-bold tracking-[0.15em] uppercase rounded-sm transition-all flex items-center gap-2 active:scale-95 ${
                canTransfer
                  ? 'bg-[#ff2b2b] text-white hover:bg-[#e51b23] shadow-[0_0_18px_rgba(255,43,43,0.35)] hover:shadow-[0_0_25px_rgba(255,43,43,0.5)]'
                  : 'bg-[#141418] text-[#4a4a4a] cursor-not-allowed'
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              Select Files
            </button>

            <button
              type="button"
              disabled={!canTransfer}
              onClick={(e) => {
                e.stopPropagation();
                openFolderPicker();
              }}
              className={`px-5 py-2.5 text-xs font-mono font-bold tracking-[0.15em] uppercase rounded-sm border transition-all flex items-center gap-2 active:scale-95 ${
                canTransfer
                  ? 'border-[#ff2b2b]/50 bg-[#12080a] text-[#ff8080] hover:bg-[#ff2b2b]/15 hover:border-[#ff2b2b]'
                  : 'border-[#202026] bg-[#0c0c0e] text-[#4a4a4a] cursor-not-allowed'
              }`}
            >
              <FolderUp className="w-4 h-4" />
              Select Folder
            </button>
          </div>
        </div>
      </div>

      {/* TRANSFERS & BATCH CONTROLS */}
      <div className="space-y-4 font-mono">
        {/* SECTION HEADER & BATCH CONTROLS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1c1c22] pb-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#8a8a8a] tracking-[0.25em] uppercase">
              // TRANSFERS ({queue.length})
            </span>
            {metrics.totalBytes > 0 && (
              <span className="text-[11px] text-[#555] font-mono">
                [{formatBytes(metrics.transferredBytes)} / {formatBytes(metrics.totalBytes)}]
              </span>
            )}

            {/* Quick Auto-Accept Toggle */}
            {onToggleAutoAccept && (
              <button
                type="button"
                onClick={onToggleAutoAccept}
                className={`px-2 py-0.5 text-[10px] font-mono rounded-xs border flex items-center gap-1 transition-all ${
                  autoAcceptFiles
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 font-bold shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                    : 'border-[#26262e] bg-[#0c0c0e] text-[#666] hover:text-[#999]'
                }`}
                title="Toggle automatic acceptance of incoming files"
              >
                <Zap className={`w-3 h-3 ${autoAcceptFiles ? 'text-emerald-400 fill-emerald-400' : 'text-[#666]'}`} />
                <span>Auto-Accept: {autoAcceptFiles ? 'ON' : 'OFF'}</span>
              </button>
            )}
          </div>

          {/* BATCH ACTION BUTTONS */}
          <div className="flex flex-wrap items-center gap-2">
            {metrics.incomingOffers > 0 && onAcceptAllOffers && (
              <button
                onClick={onAcceptAllOffers}
                className="px-2.5 py-1 text-[11px] font-mono font-bold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xs flex items-center gap-1 transition-colors"
                title="Accept all incoming file offers"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Accept All ({metrics.incomingOffers})
              </button>
            )}

            {metrics.incomingOffers > 0 && onRejectAllOffers && (
              <button
                onClick={onRejectAllOffers}
                className="px-2.5 py-1 text-[11px] font-mono text-rose-400/80 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xs flex items-center gap-1 transition-colors"
                title="Decline all incoming offers"
              >
                <X className="w-3.5 h-3.5" />
                Decline All
              </button>
            )}

            {metrics.active > 0 && onPauseAll && (
              <button
                onClick={onPauseAll}
                className="px-2.5 py-1 text-[11px] font-mono text-[#8a8a8a] hover:text-white bg-[#141418] border border-[#26262e] rounded-xs flex items-center gap-1 transition-colors"
                title="Pause all ongoing transfers"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause All
              </button>
            )}

            {metrics.paused > 0 && onResumeAll && (
              <button
                onClick={onResumeAll}
                className="px-2.5 py-1 text-[11px] font-mono text-[#ff2b2b] bg-[#141418] border border-[#ff2b2b]/40 rounded-xs flex items-center gap-1 transition-colors"
                title="Resume all paused transfers"
              >
                <Play className="w-3.5 h-3.5" />
                Resume All
              </button>
            )}

            {metrics.completed > 0 && (
              <button
                onClick={handleDownloadAllAsZip}
                disabled={isZipping}
                className="px-2.5 py-1 text-[11px] font-mono font-bold bg-[#ff2b2b]/15 hover:bg-[#ff2b2b]/25 text-[#ff8080] border border-[#ff2b2b]/40 rounded-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Download all completed files packed in a ZIP archive"
              >
                <Package className="w-3.5 h-3.5" />
                {isZipping ? 'Packaging ZIP...' : `Download ZIP (${metrics.completed})`}
              </button>
            )}

            {queue.length > 0 && onCancelAll && (
              <button
                onClick={onCancelAll}
                className="p-1 text-[#666] hover:text-rose-400 transition-colors"
                title="Clear / Cancel All"
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* AGGREGATE BATCH PROGRESS BAR */}
        {metrics.active > 0 && (
          <div className="tech-panel p-3 bg-[#0a0a0d] border border-[#ff2b2b]/30 rounded-sm space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#aaa]">
              <span className="flex items-center gap-1.5 text-white font-bold">
                <Layers className="w-3.5 h-3.5 text-[#ff2b2b]" />
                STREAMING BATCH ({metrics.active} active · {metrics.completed}/{metrics.total} done)
              </span>
              <span className="text-[#ff8080]">
                {metrics.totalSpeed > 0 ? `${formatBytes(metrics.totalSpeed)}/s` : 'Calculating...'}
                {metrics.overallEta > 0 ? ` · ${formatTimeRemaining(metrics.overallEta)} total ETA` : ''}
              </span>
            </div>
            <div className="w-full h-2 bg-[#121216] rounded-xs overflow-hidden border border-[#202028]">
              <div
                className="h-full bg-[#ff2b2b] shadow-[0_0_10px_#ff2b2b] animate-striped-progress transition-all duration-200"
                style={{ width: `${metrics.overallPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* FILTER TABS */}
        {queue.length > 0 && (
          <div className="flex items-center gap-2 pt-1 pb-1 text-xs">
            {(['all', 'active', 'completed', 'pending'] as FilterTab[]).map((tab) => {
              const count =
                tab === 'all'
                  ? queue.length
                  : tab === 'active'
                  ? metrics.active + metrics.paused
                  : tab === 'completed'
                  ? metrics.completed
                  : metrics.pendingOffers;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1 text-[11px] uppercase tracking-wider rounded-xs border transition-colors ${
                    activeTab === tab
                      ? 'border-[#ff2b2b] bg-[#ff2b2b]/10 text-white font-bold'
                      : 'border-transparent text-[#666] hover:text-[#aaa]'
                  }`}
                >
                  {tab} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* QUEUE ITEMS LIST */}
        {queue.length === 0 ? (
          <div className="tech-panel p-6 bg-[#09090b] border border-[#1c1c22] text-center text-xs text-[#4a4a4a]">
            NO ACTIVE TRANSFERS — Files and folders you send or receive will appear here.
          </div>
        ) : filteredQueue.length === 0 ? (
          <div className="tech-panel p-6 bg-[#09090b] border border-[#1c1c22] text-center text-xs text-[#4a4a4a]">
            NO TRANSFERS IN THIS CATEGORY.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredQueue.map((item) => {
              const hasFolderPath = item.relativePath && item.relativePath.includes('/') && item.relativePath !== item.name;
              const folderPrefix = hasFolderPath ? item.relativePath!.slice(0, item.relativePath!.lastIndexOf('/') + 1) : '';

              return (
                <div key={item.id} className="tech-panel p-4 bg-[#09090b] border border-[#1c1c22] space-y-3 animate-fade-in-up">
                  {/* Header: name / folder / size / actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 bg-[#050505] border border-[#18181c] rounded-sm flex-shrink-0">
                        {getFileIcon(item.type)}
                      </div>
                      <div className="min-w-0">
                        {hasFolderPath && (
                          <div className="text-[10px] text-[#ff8080] font-mono flex items-center gap-1 mb-0.5 truncate" title={item.relativePath}>
                            <Folder className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{folderPrefix}</span>
                          </div>
                        )}
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
                            onClick={() => handleDownloadReceipt(item)}
                            className="px-2.5 py-1.5 text-[11px] font-mono text-[#8a8a8a] border border-[#222] hover:border-emerald-500/50 hover:text-emerald-300 rounded-sm transition-colors flex items-center gap-1 active:scale-95"
                            title="Download Cryptographic Verification Receipt (.json)"
                          >
                            <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Receipt
                          </button>
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
                            Save
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
              );
            })}
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
