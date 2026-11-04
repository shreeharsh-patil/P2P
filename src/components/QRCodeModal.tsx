import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, sessionId }) => {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}/?join=${sessionId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn('Clipboard write failed', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Join session QR code"
        className="tech-panel p-6 max-w-sm w-full relative bg-[#09090b] border border-[#ff2b2b]/50 shadow-[0_0_30px_rgba(255,43,43,0.15)] font-mono space-y-4"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close QR code"
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
              type="button"
              onClick={handleCopyLink}
              className="p-2 text-[#ff2b2b] hover:text-white transition-colors flex-shrink-0"
              title="Copy URL"
              aria-label="Copy pairing link"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
