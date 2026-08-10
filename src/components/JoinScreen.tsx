import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Link2 } from 'lucide-react';

interface JoinScreenProps {
  onJoinSession: (code: string) => void;
  onOpenQRScanner: () => void;
  onBack: () => void;
}

export const JoinScreen: React.FC<JoinScreenProps> = ({
  onJoinSession,
  onOpenQRScanner,
  onBack
}) => {
  const [inputCode, setInputCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim().length >= 6) {
      onJoinSession(inputCode.trim());
    }
  };

  const handlePasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const match = text.match(/\b\d{6}\b/) || text.match(/join=([A-[#a-z0-9-]+)/i);
        if (match) {
          setInputCode(match[1] || match[0]);
        } else {
          setInputCode(text.trim());
        }
      }
    } catch (e) {}
  };

  return (
    <div className="w-full max-w-[960px] mx-auto px-4 sm:px-6 space-y-6 font-mono">
      {/* PAGE HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center border border-[rgba(255,255,255,0.12)] hover:border-[#ff3030] bg-[#09090b] text-[#a0a0a0] hover:text-white rounded-xs transition-colors"
            title="Back to Home"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="font-mono font-bold text-sm sm:text-base text-[#f2f2f2] tracking-wider uppercase">
            JOIN SESSION
          </h2>
        </div>

        <div className="text-xs text-[#a0a0a0] uppercase tracking-wider">
          PEER CONNECT
        </div>
      </div>

      {/* MAIN JOIN PANEL */}
      <div className="relative bg-[rgba(15,15,15,0.92)] border border-[rgba(255,255,255,0.08)] border-l-2 border-l-[#ff3030] rounded-xs p-6 sm:p-10 text-center space-y-8 shadow-2xl overflow-hidden max-w-lg mx-auto">
        <div className="space-y-2">
          <h3 className="font-mono font-bold text-sm text-[#f2f2f2] uppercase tracking-wider">
            ENTER CONNECTION CODE
          </h3>
          <p className="text-xs text-[#a0a0a0] font-sans">
            Enter the code or scan the QR code displayed on the host device.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                placeholder="EX: QNDN-4VKX"
                maxLength={14}
                className="w-full bg-[#050505] border border-[rgba(255,255,255,0.12)] focus:border-[#ff3030] rounded-xs px-4 py-3 text-center font-mono text-xl tracking-widest text-[#f2f2f2] placeholder:text-[#666666] focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={handlePasteCode}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#a0a0a0] hover:text-white rounded-xs text-xs font-mono"
                title="Paste Clipboard"
              >
                <Link2 className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenQRScanner}
              className="p-3 bg-[#050505] border border-[rgba(255,255,255,0.12)] hover:border-[#ff3030] text-[#ff3030] rounded-xs transition-colors"
              title="Scan QR Code with Camera"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>

          <button
            type="submit"
            disabled={inputCode.trim().length < 6}
            className="w-full py-3 bg-[#ff3030] hover:bg-[#e31e24] disabled:opacity-30 disabled:cursor-not-allowed text-white font-mono font-bold text-xs rounded-xs shadow-[0_0_20px_rgba(255,48,48,0.25)] flex items-center justify-center gap-2 transition-all transform active:scale-98 uppercase tracking-wider"
          >
            ESTABLISH CONNECTION
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
