import React from 'react';

export const BrandLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const iconSize = size === 'lg' ? 'w-14 h-14' : size === 'sm' ? 'w-10 h-10' : 'w-11 h-11';
  const labelSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base sm:text-lg' : 'text-lg';

  return (
    <div className="doom-brand flex items-center gap-2.5 select-none" aria-label="Dr Doom P2P">
      <img
        src="/doom/doom-favicon.png?v=6"
        className={iconSize + ' shrink-0 object-contain doom-brand-icon'}
        alt=""
        width={56}
        height={56}
      />
      <span className={labelSize + ' doom-logo-type font-black tracking-[0.12em]'}>
        DR DOOM
      </span>
    </div>
  );
};
