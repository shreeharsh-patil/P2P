import React from 'react';

export const Hero: React.FC = () => {
  return (
    <div className="text-center space-y-6 pt-10 pb-2 max-w-3xl mx-auto px-4">
      <h1 className="font-mono font-black text-5xl sm:text-6xl lg:text-7xl tracking-tight text-[#f2f2f2]">
        SHREE
      </h1>

      <p className="text-xs sm:text-sm font-mono text-[#ff2b2b] tracking-[0.3em] uppercase">
        Private. Direct. Simple.
      </p>

      <p className="text-sm sm:text-base text-[#8a8a8a] max-w-md mx-auto leading-relaxed">
        Send files and text directly between your devices.
      </p>
    </div>
  );
};
