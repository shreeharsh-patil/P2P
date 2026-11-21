import React from 'react';
export const BrandLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({size='md'}) => {
 const dimensions=size==='lg'?'w-12 h-12':size==='sm'?'w-9 h-9':'w-10 h-10';
 const textSize=size==='lg'?'text-xl':size==='sm'?'text-sm':'text-base';
 return <a href="/" className="doom-wordmark group" aria-label="Dr Doom home"><img src="/favicon.svg" alt="" className={`${dimensions} doom-wordmark-icon`}/><span className={`${textSize} doom-wordmark-text`}>DR <strong>DOOM</strong></span></a>;
};
