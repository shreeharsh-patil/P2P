import React from 'react';
import { LockKeyhole, RadioTower, ArrowLeftRight } from 'lucide-react';

export const Hero: React.FC = () => {
  return (
    <section className="relative text-center space-y-6 pt-10 sm:pt-14 pb-3 max-w-3xl mx-auto px-4 animate-fade-in-up">
      <div className="flex items-center justify-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] doomsday-eyebrow">
        <span className="h-px w-8 sm:w-14 doomsday-hud-line" />
        <span className="inline-flex items-center gap-2"><RadioTower className="h-3.5 w-3.5" /> Secure transfer interface</span>
        <span className="h-px w-8 sm:w-14 doomsday-hud-line" />
      </div>
      <div className="flex justify-center">
        <div className="doomsday-emblem relative w-20 h-20 sm:w-24 sm:h-24 p-3 border border-[#236544] rounded-md animate-glow-pulse">
          <span aria-hidden="true" className="absolute left-1 top-1 h-2 w-2 border-l border-t border-[#00e676]" />
          <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 border-r border-t border-[#00e676]" />
          <span aria-hidden="true" className="absolute left-1 bottom-1 h-2 w-2 border-l border-b border-[#00e676]" />
          <span aria-hidden="true" className="absolute right-1 bottom-1 h-2 w-2 border-r border-b border-[#00e676]" />
          <img src="/favicon.svg" alt="SHREE peer-to-peer transfer emblem" className="w-full h-full object-contain drop-shadow-[0_0_16px_rgba(0,230,118,0.35)]" />
        </div>
      </div>
      <div className="space-y-3">
        <h1 className="doomsday-hero-title font-mono font-black text-6xl sm:text-7xl lg:text-8xl tracking-[-0.07em] leading-none">SHREE</h1>
        <p className="font-mono text-xs sm:text-sm font-semibold text-[#00e676] tracking-[0.27em] uppercase">Private. Direct. Simple.</p>
      </div>
      <p className="text-sm sm:text-base text-[#afc8b7] max-w-md mx-auto leading-relaxed">
        Send files and text between your devices through a powerful peer-to-peer workspace.
      </p>
      <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-wider text-[#9abca5]">
        <span className="inline-flex items-center gap-1.5"><LockKeyhole className="w-3.5 h-3.5 text-[#00e676]" /> Encrypted transport</span>
        <span className="inline-flex items-center gap-1.5"><ArrowLeftRight className="w-3.5 h-3.5 text-[#00e676]" /> File + text transfer</span>
      </div>
    </section>
  );
};
