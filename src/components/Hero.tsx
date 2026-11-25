import React from 'react';

export const Hero: React.FC = () => {
  return (
    <div className="text-center space-y-6 pt-10 pb-2 max-w-3xl mx-auto px-4 animate-fade-in-up">
      <h1 className="mx-auto block w-full max-w-[460px]">
        <img
          src="/dropit-logo.svg"
          alt="DropIt"
          className="h-auto w-full object-contain drop-shadow-[0_8px_28px_rgba(255,30,30,0.14)]"
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
