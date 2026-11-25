import React from 'react';

export const Hero: React.FC = () => {
  return (
    <div className="mx-auto flex w-full flex-col items-center space-y-5 px-2 text-center animate-fade-in-up">
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

      <p className="max-w-md pt-1 text-sm leading-relaxed text-[#929297] sm:text-base">
        Private. Direct. Simple. Send files and text between your devices.
      </p>
    </div>
  );
};
