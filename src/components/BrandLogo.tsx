import React from 'react';

export const BrandLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dimensions = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-9 h-9' : 'w-10 h-10';
  const textSizes = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg';

  return (
    <div className="flex items-center gap-3 group select-none cursor-pointer">
      <div className={`${dimensions} relative flex items-center justify-center`}>
        <img 
          src="/dr-doom-emblem.webp" width={96} height={96} 
          alt="DR DOOM logo" 
          className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(0,230,118,0.4)] group-hover:drop-shadow-[0_0_14px_rgba(0,230,118,0.7)] transition-all duration-300 transform group-hover:scale-105"
        />
      </div>

      <div className="flex flex-col">
        <span className={`font-mono font-black tracking-[0.08em] ${textSizes} text-[#f2f2f2] group-hover:text-white transition-colors uppercase`}>
          DR DOOM
        </span>
      </div>
    </div>
  );
};
