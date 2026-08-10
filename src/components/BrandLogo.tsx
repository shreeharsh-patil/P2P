import React from 'react';

export const BrandLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dimensions = size === 'lg' ? 'w-10 h-10' : size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const textSizes = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg';

  return (
    <div className="flex items-center gap-3 group select-none cursor-pointer">
      <div className={`${dimensions} relative flex items-center justify-center`}>
        <img 
          src="/favicon.svg" 
          alt="SHREE Logo" 
          className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(255,48,48,0.4)] group-hover:drop-shadow-[0_0_14px_rgba(255,48,48,0.7)] transition-all duration-300 transform group-hover:scale-105"
        />
      </div>

      <div className="flex flex-col">
        <span className={`font-mono font-black tracking-[0.2em] ${textSizes} text-[#f2f2f2] group-hover:text-white transition-colors uppercase`}>
          SHREE
        </span>
      </div>
    </div>
  );
};
