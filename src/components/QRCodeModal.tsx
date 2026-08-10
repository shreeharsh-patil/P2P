import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, sessionId }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/?join=${sessionId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="tech-panel p-6 max-w-sm w-full relative bg-[#09090b] border border-[#ff2b2b]/50 shadow-[0_0_30px_rgba(255,43,43,0.15)] font-mono space-y-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-[#8a8a8a] hover:text-white rounded-xs transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-3">
          <h3 className="text-sm font-bold text-[#f2f2f2] tracking-wide">Scan to connect</h3>
          <p className="text-xs text-[#8a8a8a]">
            Point your camera at this code to join the session.
          </p>

          <div className="bg-white p-3 rounded-xs inline-block border-2 border-[#ff2b2b]">
            <QRCodeSVG
              value={shareUrl}
              size={190}
              level="H"
              includeMargin={false}
            />
          </div>

          <div className="bg-[#050505] p-3 rounded-xs border border-[#1c1c22] flex items-center justify-between text-left">
            <div className="overflow-hidden mr-2 font-mono">
              <div className="text-[9px] uppercase text-[#4a4a4a] font-bold">Pairing link</div>
              <div className="text-xs text-[#8a8a8a] truncate">{shareUrl}</div>
            </div>
            <button
              onClick={handleCopyLink}
              className="p-2 text-[#ff2b2b] hover:text-white transition-colors flex-shrink-0"
              title="Copy URL"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
