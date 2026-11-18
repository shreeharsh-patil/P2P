import React, { useEffect, useState } from 'react';
import { Copy, Check, QrCode } from 'lucide-react';
import { WebRTCState } from '../network/WebRTCManager';
import { StatusIndicator } from './StatusIndicator';

interface SessionPanelProps {
  sessionId: string;
  webrtcState: WebRTCState;
  onOpenQRModal: () => void;
}

export const SessionPanel: React.FC<SessionPanelProps> = ({ sessionId, webrtcState, onOpenQRModal }) => {
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes session expiration

  useEffect(() => {
    if (webrtcState !== 'connected') {
      const timer = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [webrtcState]);

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleCopyCode = () => {
    if (sessionId) {
      navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isConnecting = webrtcState === 'connecting';

  return (
    <div className="tech-panel p-8 sm:p-10 bg-[#09140e] border border-[#1c3829] text-center relative overflow-hidden">
      <div className="font-mono text-xs text-[#8a8a8a] tracking-[0.3em] uppercase">
        Your Session
      </div>

      {/* Session Code */}
      <div className="mt-6 inline-flex items-center gap-4 bg-[#050a07] px-8 sm:px-10 py-5 rounded-sm border border-[#00e676]/40 shadow-[0_0_30px_rgba(0,230,118,0.1)]">
        <span className="font-mono text-4xl sm:text-5xl font-black tracking-[0.15em] text-[#00e676]">
          {sessionId}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={handleCopyCode}
          className="px-4 py-2 text-xs font-mono font-semibold bg-[#11241a] hover:bg-[#173024] text-[#f2f2f2] border border-[#2a4635] rounded-sm flex items-center gap-2 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy Code'}
        </button>
        <button
          onClick={onOpenQRModal}
          className="px-4 py-2 text-xs font-mono font-semibold bg-[#11241a] hover:bg-[#173024] text-[#f2f2f2] border border-[#2a4635] rounded-sm flex items-center gap-2 transition-colors"
        >
          <QrCode className="w-4 h-4 text-[#00e676]" />
          Show QR
        </button>
      </div>

      {/* Waiting Status */}
      <div className="mt-8 flex flex-col items-center space-y-2">
        <StatusIndicator status={isConnecting ? 'connecting' : 'waiting'} size="sm" />
        <p className="text-xs text-[#8a8a8a]">
          {isConnecting ? 'Connecting to the other device...' : 'Waiting for another device...'}
        </p>
      </div>

      {/* Expiry */}
      <div className="mt-6 text-[11px] font-mono text-[#4a4a4a]">
        Expires in <span className="text-[#00e676] font-bold">{formatTimer(timeLeft)}</span>
      </div>
    </div>
  );
};
