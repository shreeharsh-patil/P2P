import React from 'react';
export const BrandLogo: React.FC<{ size?: 'sm'|'md'|'lg' }> = ({size='md'}) => {
 const icon = size==='lg' ? 'w-16 h-16' : size==='sm' ? 'w-9 h-9' : 'w-11 h-11';
 const label = size==='lg' ? 'text-2xl' : size==='sm' ? 'text-sm sm:text-base' : 'text-lg';
 return <div className="doom-brand flex items-center gap-2.5 select-none" aria-label="Dr Doom">
  <img src="/doom/doom-favicon.png" className={icon+' shrink-0 object-contain doom-brand-icon'} alt="Dr Doom hooded mask"/>
  <div className="flex flex-col leading-tight">
   <span className={label+' doom-logo-type font-black tracking-[0.13em]'}>DR DOOM</span>
   {size!=='sm' && <span className="text-[9px] tracking-[.25em] text-[#9bcba4] uppercase">P2P FILE TRANSFER</span>}
  </div>
 </div>;
};