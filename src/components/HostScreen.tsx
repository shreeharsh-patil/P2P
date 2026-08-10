import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, RefreshCw, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';
import { WebRTCState } from '../network/WebRTCManager';

interface HostScreenProps {
  sessionId: string;
  webrtcState: WebRTCState;
  onRegenerateSession: () => void;
  onBack: () => void;
}

export const HostScreen: React.FC<HostScreenProps> = ({
  sessionId,
  webrtcState,
  onRegenerateSession,
  onBack
}) => {
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes (300s) expiration
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setTimeLeft(300); // Reset timer when sessionId changes
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionId]);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleCopyCode = () => {
    const shareUrl = `${window.location.origin}/?join=${sessionId}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = timeLeft === 0;
  const shareUrl = `${window.location.origin}/?join=${sessionId}`;

  // Format code with hyphen (e.g. QNDN-4VKX-PCGQ or 482-910)
  const formattedCode = sessionId.length === 6 
    ? `${sessionId.slice(0, 3)}-${sessionId.slice(3)}` 
    : sessionId;

  return (
    <div className="w-full max-w-[960px] mx-auto px-4 sm:px-6 space-y-6 font-mono animate-fade-in-up">
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
            HOST
          </h2>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#a0a0a0]">
          <span className="w-2 h-2 rounded-full bg-[#ff3030] animate-ping" />
          <span className="text-[#ff3030] font-bold tracking-wider uppercase">WAITING FOR PEER</span>
        </div>
      </div>

      {/* MAIN SESSION PANEL */}
      <div className="relative bg-[rgba(15,15,15,0.92)] border border-[rgba(255,255,255,0.08)] border-l-2 border-l-[#ff3030] rounded-xs p-6 sm:p-10 text-center space-y-8 shadow-2xl overflow-hidden animate-scale-in">
        {/* Technical Corner Accents */}
        <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-[#ff3030]/60 pointer-events-none" />
        <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-[#ff3030]/60 pointer-events-none" />
        <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-[#ff3030]/60 pointer-events-none" />
        <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-[#ff3030]/60 pointer-events-none" />

        {/* INSTRUCTION */}
        <div className="text-xs sm:text-sm font-mono text-[#a0a0a0] uppercase tracking-[0.18em]">
          SCAN ON THE OTHER DEVICE
        </div>

        {/* QR CODE CONTAINER WITH GLOW PULSE */}
        <div className="relative inline-block my-2">
          {/* Red Technical Corner Accent */}
          <div className="absolute -top-2 -left-2 w-4 h-4 border-t-2 border-l-2 border-[#ff3030] pointer-events-none" />
          <div className="absolute -top-2 -right-2 w-4 h-4 border-t-2 border-r-2 border-[#ff3030] pointer-events-none" />
          <div className="absolute -bottom-2 -left-2 w-4 h-4 border-b-2 border-l-2 border-[#ff3030] pointer-events-none" />
          <div className="absolute -bottom-2 -right-2 w-4 h-4 border-b-2 border-r-2 border-[#ff3030] pointer-events-none" />

          <div className="bg-white p-4 sm:p-5 rounded-xs inline-block shadow-xl border border-white/20 animate-glow-pulse">
            {!isExpired ? (
              <QRCodeSVG
                value={shareUrl}
                size={260}
                level="H"
                includeMargin={false}
                className="w-[220px] h-[220px] sm:w-[280px] sm:h-[280px]"
              />
            ) : (
              <div className="w-[220px] h-[220px] sm:w-[280px] sm:h-[280px] bg-[#121216] flex flex-col items-center justify-center text-center p-4 text-[#a0a0a0] font-mono text-xs">
                <span className="text-[#ff3030] font-bold mb-2">SESSION EXPIRED</span>
                <span>Generate a new session to continue</span>
              </div>
            )}
          </div>
        </div>

        {/* DIVIDER */}
        <div className="flex items-center justify-center gap-4 text-[11px] text-[#666666] tracking-widest uppercase">
          <div className="h-[1px] w-16 bg-[rgba(255,255,255,0.08)]" />
          <span>OR SHARE THIS CODE</span>
          <div className="h-[1px] w-16 bg-[rgba(255,255,255,0.08)]" />
        </div>

        {/* CONNECTION CODE */}
        <div className="space-y-3">
          <div className="font-mono text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-[0.12em] text-[#ff3030]">
            {formattedCode}
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              onClick={handleCopyCode}
              disabled={isExpired}
              className="px-4 py-2 text-xs font-mono font-bold bg-[#080808] hover:bg-[#141418] disabled:opacity-30 border border-[rgba(255,255,255,0.12)] hover:border-[#ff3030] text-[#f2f2f2] rounded-xs flex items-center gap-2 transition-all active:scale-95"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>COPIED ✓</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-[#ff3030]" />
                  <span>COPY CODE</span>
                </>
              )}
            </button>

            <button
              onClick={onRegenerateSession}
              className="px-4 py-2 text-xs font-mono font-bold bg-[#080808] hover:bg-[#141418] border border-[rgba(255,255,255,0.12)] hover:border-[#ff3030] text-[#a0a0a0] hover:text-[#f2f2f2] rounded-xs flex items-center gap-2 transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#a0a0a0]" />
              <span>REGENERATE</span>
            </button>
          </div>
        </div>

        {/* EXPIRATION TIMER */}
        <div className="text-xs font-mono tracking-wider">
          {!isExpired ? (
            <span className="text-[#a0a0a0]">
              expires in <span className="text-[#ff3030] font-bold">{formatTimer(timeLeft)}</span>
            </span>
          ) : (
            <button
              onClick={onRegenerateSession}
              className="px-4 py-2 bg-[#ff3030] hover:bg-[#e31e24] text-white font-mono font-bold text-xs rounded-xs tracking-wider uppercase animate-glow-pulse active:scale-95"
            >
              CREATE NEW SESSION
            </button>
          )}
        </div>

        {/* ADVANCED COLLAPSIBLE ACCORDION */}
        <div className="pt-4 border-t border-[rgba(255,255,255,0.08)]">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-[#a0a0a0] hover:text-[#f2f2f2] font-mono tracking-wider flex items-center gap-1.5 mx-auto transition-colors"
          >
            <span>{showAdvanced ? '- ADVANCED' : '+ ADVANCED'}</span>
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showAdvanced && (
            <div className="mt-4 p-4 bg-[#080808] border border-[rgba(255,255,255,0.06)] rounded-xs grid grid-cols-2 sm:grid-cols-3 gap-3 text-left text-[11px] font-mono animate-fade-in-up">
              <div>
                <span className="text-[#666666] block text-[9px] uppercase">Protocol</span>
                <span className="text-[#f2f2f2]">WebRTC</span>
              </div>
              <div>
                <span className="text-[#666666] block text-[9px] uppercase">Network</span>
                <span className="text-[#ff3030]">Direct P2P</span>
              </div>
              <div>
                <span className="text-[#666666] block text-[9px] uppercase">Channel</span>
                <span className="text-[#f2f2f2]">RTCDataChannel</span>
              </div>
              <div>
                <span className="text-[#666666] block text-[9px] uppercase">Encryption</span>
                <span className="text-[#f2f2f2]">DTLS / SRTP</span>
              </div>
              <div>
                <span className="text-[#666666] block text-[9px] uppercase">Server</span>
                <span className="text-[#f2f2f2]">Signaling Only</span>
              </div>
              <div>
                <span className="text-[#666666] block text-[9px] uppercase">Storage</span>
                <span className="text-[#f2f2f2]">Zero Server RAM</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM INFORMATION BLOCK */}
      <div className="p-4 bg-[#080808] border border-[rgba(255,255,255,0.06)] rounded-xs text-[11px] font-mono text-[#a0a0a0] text-center space-y-1">
        <span className="text-[#ff3030] font-bold tracking-wider uppercase">ONE-TIME CODE</span>
        <p className="text-[#666666] font-sans">
          This code is unique to this session. It becomes invalid when a peer connects or when the timer expires.
        </p>
      </div>
    </div>
  );
};
