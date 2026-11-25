import React from 'react';

export const BrandLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dimensions = size === 'lg' ? 'w-10 h-10' : size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const wordmarkSize = size === 'lg' ? 'w-[126px] h-10' : size === 'sm' ? 'w-[88px] h-7' : 'w-[108px] h-8';

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

      <img
        src="/dropit-wordmark.svg"
        alt="DropIt"
        className={`${wordmarkSize} object-contain mix-blend-screen transition-transform duration-300 group-hover:scale-[1.02]`}
      />
    </div>
  );
};
