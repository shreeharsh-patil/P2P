import React, { useState } from 'react';
import { Camera, Link2, ArrowRight } from 'lucide-react';

interface LandingActionsProps {
  activeMode: 'create' | 'join';
  onCreateSession: () => void;
  onSelectJoin: () => void;
  onJoinSession: (code: string) => void;
  onOpenQRScanner: () => void;
}

export const LandingActions: React.FC<LandingActionsProps> = ({
  activeMode,
  onCreateSession,
  onSelectJoin,
  onJoinSession,
  onOpenQRScanner
}) => {
  const [inputCode, setInputCode] = useState('');

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim().length >= 6) {
      onJoinSession(inputCode.trim());
    }
  };

  const handlePasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const match = text.match(/\b\d{6}\b/) || text.match(/join=(\d{6})/);
        if (match) {
          setInputCode(match[1] || match[0]);
        } else {
          setInputCode(text.trim());
        }
      }
    } catch (e) {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="max-w-xl mx-auto w-full space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCreateSession}
          className="py-3.5 bg-[#00e676] hover:bg-[#00c56b] text-white font-mono font-bold text-xs tracking-[0.2em] uppercase rounded-sm shadow-[0_0_18px_rgba(0,230,118,0.3)] transition-all active:scale-[0.98]"
        >
          Create Session
        </button>
        <button
          type="button"
          onClick={onSelectJoin}
          className={`py-3.5 font-mono font-bold text-xs tracking-[0.2em] uppercase rounded-sm border transition-all active:scale-[0.98] ${
            activeMode === 'join'
              ? 'border-[#00e676]/70 text-[#00e676] bg-[#00e676]/5'
              : 'border-[#2d4939] text-[#f2f2f2] hover:border-[#00e676]/60 hover:text-[#00e676]'
          }`}
        >
          Join Session
        </button>
      </div>

      {activeMode === 'join' && (
        <form onSubmit={handleJoinSubmit} className="tech-panel p-4 bg-[#09140e] border border-[#1c3829] space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="ENTER 6-DIGIT CODE"
              maxLength={10}
              autoFocus
              className="flex-1 bg-[#050a07] border border-[#1c3829] focus:border-[#00e676] rounded-sm px-4 py-2.5 text-center font-mono text-lg tracking-[0.2em] text-[#f2f2f2] placeholder:text-[#4a4a4a] focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={onOpenQRScanner}
              className="p-2.5 bg-[#050a07] border border-[#1c3829] hover:border-[#00e676] text-[#00e676] rounded-sm transition-colors"
              title="Scan QR Code with camera"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePasteCode}
              className="px-3 py-2 text-[11px] font-mono text-[#8a8a8a] hover:text-[#f2f2f2] border border-[#2a4635] bg-[#11241a] hover:bg-[#173024] rounded-sm flex items-center gap-1.5 transition-colors"
            >
              <Link2 className="w-3.5 h-3.5" />
              Paste
            </button>
            <button
              type="submit"
              disabled={inputCode.trim().length < 6}
              className="flex-1 py-2 bg-[#00e676] hover:bg-[#00c56b] disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono font-bold text-xs tracking-[0.2em] uppercase rounded-sm flex items-center justify-center gap-2 transition-all"
            >
              Connect
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
