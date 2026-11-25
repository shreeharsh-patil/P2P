import React from 'react';

export const BrandLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const wordmarkSize = size === 'lg' ? 'w-[116px]' : size === 'sm' ? 'w-[78px]' : 'w-[96px]';

  return (
    <div className="flex items-center group select-none cursor-pointer">
      <img
        src="/dropit-logo.svg"
        alt="DropIt"
        className={`${wordmarkSize} h-auto object-contain transition-transform duration-300 group-hover:scale-[1.02]`}
      />
    </div>
  );
};
