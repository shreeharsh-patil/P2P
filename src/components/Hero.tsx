import React from 'react';

export const Hero: React.FC = () => {
  return (
    <div className="mx-auto w-full space-y-5 px-2 py-3 text-center animate-fade-in-up lg:mx-0 lg:text-left">
      <h1 className="mx-auto block w-full max-w-[420px] lg:mx-0">
        <img
          src="/dropit-logo.svg"
          alt="DropIt"
          className="h-auto w-full object-contain drop-shadow-[0_8px_28px_rgba(255,30,30,0.14)]"
        />
      </h1>

      <p className="text-xs font-mono tracking-[0.22em] text-[#ff5b61] uppercase sm:text-sm">
        Private. Direct. Simple.
      </p>

      <p className="mx-auto max-w-md text-sm leading-relaxed text-[#a0a0a0] sm:text-base lg:mx-0">
        Send files and text directly between your devices.
      </p>
    </div>
  );
};
