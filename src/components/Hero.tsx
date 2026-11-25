import React from 'react';

export const Hero: React.FC = () => {
  return (
    <div className="text-center space-y-6 pt-10 pb-2 max-w-3xl mx-auto px-4 animate-fade-in-up">
      {/* Official SHREE Logo Emblem */}
      <div className="flex justify-center mb-2">
        <div className="w-16 h-16 sm:w-20 sm:h-20 relative p-1 bg-[#09090b] border border-[rgba(255,255,255,0.08)] rounded-xs shadow-[0_0_30px_rgba(255,48,48,0.25)] animate-glow-pulse">
          <img 
            src="/favicon.svg" 
            alt="SHREE Logo Emblem" 
            className="w-full h-full object-contain filter drop-shadow-[0_0_10px_rgba(255,48,48,0.6)]"
          />
        </div>
      </div>

      <h1 className="font-mono font-black text-5xl sm:text-6xl lg:text-7xl tracking-tight text-[#f2f2f2]">
        SHREE
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
