import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, SwitchCamera, Image, AlertCircle, RefreshCw } from 'lucide-react';

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
  const qrCodeRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isStarting, setIsStarting] = useState(false);

  const startScanner = async (mode: 'environment' | 'user') => {
    try {
      setErrorMessage(null);
      setIsStarting(true);

      // Stop existing instance if running
      if (qrCodeRef.current) {
        try {
          if (qrCodeRef.current.isScanning) {
            await qrCodeRef.current.stop();
          }
          qrCodeRef.current.clear();
        } catch (e) {}
      }

      const qrScanner = new Html5Qrcode('qr-reader-container');
      qrCodeRef.current = qrScanner;

      const config = {
        fps: 10,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1.0
      };

      await qrScanner.start(
        { facingMode: mode },
        config,
        (decodedText) => {
          const match = decodedText.match(/\b\d{6}\b/) || decodedText.match(/join=([A-Za-z0-9-]+)/i);
          const finalCode = match ? (match[1] || match[0]) : decodedText.trim();

          if (qrScanner.isScanning) {
            qrScanner.stop().catch(() => {});
          }
          qrScanner.clear();
          onScanSuccess(finalCode);
          onClose();
        },
        () => {
          // Ignored per-frame scan failures
        }
      );
      setIsStarting(false);
    } catch (err: any) {
      console.warn('Failed to start camera scanner', err);
      setIsStarting(false);

      if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        setErrorMessage('Camera access requires HTTPS when accessing from mobile.');
      } else if (err?.name === 'NotAllowedError' || err?.toString().includes('Permission denied')) {
        setErrorMessage('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (mode === 'environment') {
        // Retry with default user camera if environment camera is unavailable
        setFacingMode('user');
        startScanner('user');
      } else {
        setErrorMessage('Unable to access camera on this device. You can upload an image of the QR code instead.');
      }
    }
  };

  useEffect(() => {
    let timer: any = null;
    if (isOpen) {
      // Small timeout to ensure container DOM element is mounted
      timer = setTimeout(() => {
        startScanner(facingMode);
      }, 100);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (qrCodeRef.current) {
        try {
          if (qrCodeRef.current.isScanning) {
            qrCodeRef.current.stop().catch(() => {});
          }
          qrCodeRef.current.clear();
        } catch (e) {}
      }
    };
  }, [isOpen]);

  const handleFlipCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startScanner(nextMode);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      try {
        if (!qrCodeRef.current) {
          qrCodeRef.current = new Html5Qrcode('qr-reader-container');
        }
        const decodedResult = await qrCodeRef.current.scanFile(file, true);
        const match = decodedResult.match(/\b\d{6}\b/) || decodedResult.match(/join=([A-Za-z0-9-]+)/i);
        const finalCode = match ? (match[1] || match[0]) : decodedResult.trim();
        onScanSuccess(finalCode);
        onClose();
      } catch (err) {
        setErrorMessage('No valid QR code found in the selected image.');
      }
    }
    e.target.value = '';
  };

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
            <h3 className="text-sm font-bold text-[#f2f2f2] tracking-wide">QR Scanner</h3>
          </div>
          <p className="text-xs text-[#8a8a8a]">
            Point your camera at the host QR code or upload an image.
          </p>

          {/* CAMERA VIEWFINDER */}
          <div className="rounded-xs overflow-hidden bg-[#050505] border border-[#ff2b2b]/40 p-2 min-h-[250px] relative flex items-center justify-center">
            <div id="qr-reader-container" className="w-full text-white overflow-hidden rounded-xs"></div>

            {isStarting && (
              <div className="absolute inset-0 bg-[#050505]/80 flex flex-col items-center justify-center gap-2 text-xs text-[#ff8080]">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Starting camera...</span>
              </div>
            )}
          </div>

          {/* ERROR DISPLAY */}
          {errorMessage && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xs text-[11px] text-rose-300 flex items-start gap-2 text-left">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* SCANNER ACTIONS (FLIP CAMERA / UPLOAD IMAGE) */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleFlipCamera}
              className="px-3 py-1.5 text-xs font-mono text-[#a0a0a0] hover:text-white bg-[#141418] border border-[#26262e] rounded-xs flex items-center gap-1.5 transition-colors"
              title="Switch between front and rear cameras"
            >
              <SwitchCamera className="w-3.5 h-3.5" />
              Flip Camera
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs font-mono text-[#ff8080] hover:text-white bg-[#180a0c] border border-[#ff2b2b]/40 rounded-xs flex items-center gap-1.5 transition-colors"
              title="Upload QR code from gallery or screenshots"
            >
              <Image className="w-3.5 h-3.5" />
              Scan Photo
            </button>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
