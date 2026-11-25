import React from 'react';
import { LockKeyhole, Radio, Server } from 'lucide-react';
import { Badge } from './ui/badge';

export const Hero: React.FC = () => {
  return (
    <div className="mx-auto flex w-full flex-col items-center space-y-5 px-2 text-center animate-fade-in-up">
      <p className="border border-[#242428] bg-[#080809]/80 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#929297]">
        <span className="mr-2 text-[#ff4b51]">&gt;</span> Zero install <span className="px-2 text-[#ff4b51]">·</span> No account required
      </p>

      <h1 className="mx-auto block w-full max-w-[400px]">
        <img
          src="/dropit-logo.svg"
          alt="DropIt"
          className="h-auto w-full object-contain drop-shadow-[0_8px_28px_rgba(255,30,30,0.14)]"
        />
      </h1>

      <p className="-mt-1 bg-[#080809]/85 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-[#96969b] sm:text-xs">
        P2P File &amp; Text Transfer
      </p>

      <div className="flex flex-wrap justify-center gap-2 pt-1">
        <Badge variant="outline" className="gap-1.5"><LockKeyhole className="h-3 w-3 text-[#ff666b]" /> Encryption: DTLS</Badge>
        <Badge variant="outline" className="gap-1.5"><Server className="h-3 w-3 text-[#ff666b]" /> Server: Signaling</Badge>
        <Badge variant="outline" className="gap-1.5"><Radio className="h-3 w-3 text-[#ff666b]" /> Protocol: WebRTC</Badge>
      </div>

      <p className="max-w-md pt-1 text-sm leading-relaxed text-[#929297] sm:text-base">
        Private. Direct. Simple. Send files and text between your devices.
      </p>
    </div>
  );
};
