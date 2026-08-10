import React from 'react';
import { X, Download, Eye, FileText } from 'lucide-react';
import { TransferItem } from '../engine/types';

interface FilePreviewModalProps {
  item: TransferItem | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ item, onClose }) => {
  if (!item || !item.downloadUrl) return null;

  const isImage = item.type.startsWith('image/');
  const isVideo = item.type.startsWith('video/');
  const isAudio = item.type.startsWith('audio/');
  const isPDF = item.type.includes('pdf');
  const isText = item.type.includes('text') || item.name.endsWith('.txt') || item.name.endsWith('.md') || item.name.endsWith('.json') || item.name.endsWith('.js') || item.name.endsWith('.ts');

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = item.downloadUrl!;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-scale-in">
      <div className="bg-[#09090b] border border-[#222] rounded-md max-w-3xl w-full overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1c1c22]">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-white uppercase tracking-wider truncate pr-4">
            <Eye className="w-4 h-4 text-[#ff2b2b]" />
            <span className="truncate">{item.name}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#888] hover:text-white hover:bg-[#1a1a20] rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-auto flex items-center justify-center bg-[#050505] min-h-[250px]">
          {isImage ? (
            <img
              src={item.downloadUrl}
              alt={item.name}
              className="max-h-[60vh] object-contain rounded border border-[#1a1a20] shadow-lg"
            />
          ) : isVideo ? (
            <video
              src={item.downloadUrl}
              controls
              autoPlay
              className="max-h-[60vh] w-full rounded border border-[#1a1a20]"
            />
          ) : isAudio ? (
            <div className="w-full max-w-md p-6 bg-[#09090b] border border-[#1c1c22] rounded-md text-center space-y-4">
              <p className="text-xs font-mono text-[#aaa]">{item.name}</p>
              <audio src={item.downloadUrl} controls className="w-full" />
            </div>
          ) : isPDF ? (
            <iframe
              src={item.downloadUrl}
              title={item.name}
              className="w-full h-[60vh] rounded border border-[#1a1a20]"
            />
          ) : isText ? (
            <iframe
              src={item.downloadUrl}
              title={item.name}
              className="w-full h-[50vh] bg-black text-[#00ff88] font-mono p-4 rounded border border-[#1a1a20]"
            />
          ) : (
            <div className="text-center space-y-4 py-8">
              <FileText className="w-12 h-12 text-[#ff2b2b] mx-auto opacity-70" />
              <p className="text-xs font-mono text-[#8a8a8a]">
                Preview not supported for this file type.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[#1c1c22] bg-[#09090b]">
          <span className="text-xs font-mono text-[#666]">
            Type: <span className="text-[#aaa]">{item.type || 'Binary'}</span>
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono text-[#888] border border-[#222] hover:border-[#444] rounded uppercase tracking-wider transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 text-xs font-mono font-bold text-white bg-[#ff2b2b] hover:bg-[#e51b23] rounded flex items-center gap-1.5 uppercase tracking-wider transition-colors active:scale-95 shadow-[0_0_15px_rgba(255,43,43,0.3)]"
            >
              <Download className="w-3.5 h-3.5" />
              Save File
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
