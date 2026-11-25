import React from 'react';

export const BrandLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dimensions = size === 'lg' ? 'w-10 h-10' : size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const wordmarkSize = size === 'lg' ? 'w-[126px] aspect-[3.68]' : size === 'sm' ? 'w-[88px] aspect-[3.68]' : 'w-[108px] aspect-[3.68]';

  return (
    <div className="flex items-center gap-3 group select-none cursor-pointer">
      <div className={`${dimensions} relative flex items-center justify-center`}>
        <img 
          src="/favicon.svg" 
          alt=""
          aria-hidden="true"
          className="w-full h-full object-contain filter drop-shadow-[0_0_8px_rgba(255,48,48,0.4)] group-hover:drop-shadow-[0_0_14px_rgba(255,48,48,0.7)] transition-all duration-300 transform group-hover:scale-105"
        />
      </div>

      <span className={`${wordmarkSize} relative block overflow-hidden mix-blend-screen transition-transform duration-300 group-hover:scale-[1.02]`}>
        <img
          src="/dropit-logo-reference.png"
          alt="DropIt"
          className="absolute left-0 top-0 aspect-square w-full max-w-none -translate-y-[51.44%] object-contain"
        />
      </span>
    </div>
  );
};
