import React from 'react';

export const BrandLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dimensions = size === 'lg' ? 'w-10 h-10' : size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const textSizes = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-lg' : 'text-xl';

  return (
    <div className="flex items-center gap-3 group">
      <div className={`${dimensions} relative flex items-center justify-center`}>
        {/* Outer sharp tech border */}
        <div className="absolute inset-0 border border-[#ff2b2b]/40 bg-[#09090b] rounded-sm transform rotate-45 transition-transform group-hover:rotate-90 group-hover:border-[#ff2b2b] duration-300" />
        
        {/* Core crimson node */}
        <div className="relative z-10 w-2.5 h-2.5 bg-[#ff2b2b] rounded-xs shadow-[0_0_8px_#ff2b2b]" />
      </div>

      <div className="flex flex-col">
        <span className={`font-mono font-black tracking-widest ${textSizes} text-[#f2f2f2] group-hover:text-white transition-colors`}>
          SHREE
        </span>
      </div>
    </div>
  );
};
