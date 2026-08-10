import React, { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { X, Camera } from 'lucide-react';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (code: string) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess
}) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (isOpen) {
      const scanner = new Html5QrcodeScanner(
        'qr-reader-container',
        {
          fps: 10,
          qrbox: { width: 200, height: 200 },
          aspectRatio: 1.0
        },
        false
      );

      scanner.render(
        (decodedText) => {
          const match = decodedText.match(/\b\d{6}\b/) || decodedText.match(/join=(\d{6})/);
          if (match) {
            onScanSuccess(match[1] || match[0]);
          } else {
            onScanSuccess(decodedText.trim());
          }
          scanner.clear().catch(() => {});
          onClose();
        },
        (error) => {}
      );

      scannerRef.current = scanner;

      return () => {
        if (scannerRef.current) {
          scannerRef.current.clear().catch(() => {});
        }
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="tech-panel p-6 max-w-sm w-full relative bg-[#09090b] border border-[#ff2b2b]/50 shadow-[0_0_30px_rgba(255,43,43,0.15)] font-mono space-y-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 text-[#8a8a8a] hover:text-white rounded-xs transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-[#ff2b2b]">
            <Camera className="w-5 h-5" />
            <h3 className="text-sm font-bold text-[#f2f2f2] tracking-wide">Scanner active</h3>
          </div>
          <p className="text-xs text-[#8a8a8a]">
            Point your camera at the host QR code.
          </p>

          <div className="rounded-xs overflow-hidden bg-[#050505] border border-[#ff2b2b]/40 p-2 min-h-[240px] flex items-center justify-center">
            <div id="qr-reader-container" className="w-full text-white"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
