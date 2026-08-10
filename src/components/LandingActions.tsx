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
          className="py-3.5 bg-[#ff2b2b] hover:bg-[#e51b23] text-white font-mono font-bold text-xs tracking-[0.2em] uppercase rounded-sm shadow-[0_0_18px_rgba(255,43,43,0.3)] transition-all active:scale-[0.98]"
        >
          Create Session
        </button>
        <button
          type="button"
          onClick={onSelectJoin}
          className={`py-3.5 font-mono font-bold text-xs tracking-[0.2em] uppercase rounded-sm border transition-all active:scale-[0.98] ${
            activeMode === 'join'
              ? 'border-[#ff2b2b]/70 text-[#ff2b2b] bg-[#ff2b2b]/5'
              : 'border-[#2a2a32] text-[#f2f2f2] hover:border-[#ff2b2b]/60 hover:text-[#ff2b2b]'
          }`}
        >
          Join Session
        </button>
      </div>

      {activeMode === 'join' && (
        <form onSubmit={handleJoinSubmit} className="tech-panel p-4 bg-[#09090b] border border-[#1c1c22] space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="ENTER 6-DIGIT CODE"
              maxLength={10}
              autoFocus
              className="flex-1 bg-[#050505] border border-[#1c1c22] focus:border-[#ff2b2b] rounded-sm px-4 py-2.5 text-center font-mono text-lg tracking-[0.2em] text-[#f2f2f2] placeholder:text-[#4a4a4a] focus:outline-none transition-colors"
            />
            <button
              type="button"
              onClick={onOpenQRScanner}
              className="p-2.5 bg-[#050505] border border-[#1c1c22] hover:border-[#ff2b2b] text-[#ff2b2b] rounded-sm transition-colors"
              title="Scan QR Code with camera"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePasteCode}
              className="px-3 py-2 text-[11px] font-mono text-[#8a8a8a] hover:text-[#f2f2f2] border border-[#26262e] bg-[#141418] hover:bg-[#1a1a20] rounded-sm flex items-center gap-1.5 transition-colors"
            >
              <Link2 className="w-3.5 h-3.5" />
              Paste
            </button>
            <button
              type="submit"
              disabled={inputCode.trim().length < 6}
              className="flex-1 py-2 bg-[#ff2b2b] hover:bg-[#e51b23] disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono font-bold text-xs tracking-[0.2em] uppercase rounded-sm flex items-center justify-center gap-2 transition-all"
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
