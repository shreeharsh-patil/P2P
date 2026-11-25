import React from 'react';

export const Hero: React.FC = () => {
  return (
    <div className="text-center space-y-6 pt-10 pb-2 max-w-3xl mx-auto px-4 animate-fade-in-up">
      {/* DropIt logo emblem */}
      <div className="flex justify-center mb-2">
        <div className="w-16 h-16 sm:w-20 sm:h-20 relative p-1 bg-[#09090b] border border-[rgba(255,255,255,0.08)] rounded-xs shadow-[0_0_30px_rgba(255,48,48,0.25)] animate-glow-pulse">
          <img 
            src="/favicon.svg" 
            alt="DropIt logo emblem"
            className="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(255,48,48,0.6)]"
          />
        </div>
      </div>

      <h1 className="mx-auto w-full max-w-[460px]">
        <img
          src="/dropit-wordmark.svg"
          alt="DropIt"
          className="mx-auto h-auto w-full mix-blend-screen drop-shadow-[0_8px_28px_rgba(255,30,30,0.14)]"
        />
      </h1>

      <p className="text-xs sm:text-sm font-mono text-[#ff3030] tracking-[0.3em] uppercase">
        Private. Direct. Simple.
      </p>

      <p className="text-sm sm:text-base text-[#a0a0a0] max-w-md mx-auto leading-relaxed font-sans">
        Send files and text directly between your devices.
      </p>
    </div>
  );
};
