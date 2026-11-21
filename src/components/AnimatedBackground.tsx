import React from 'react';
/** CSS-composited layers preserve smooth transfer UX without continuous canvas painting. */
export const AnimatedBackground: React.FC = () => (
 <div className="doom-environment" aria-hidden="true">
  <div className="doom-artwork"/>
  <div className="doom-atmosphere"/>
  <div className="doom-sigil doom-sigil-a"><svg viewBox="0 0 200 200" fill="none"><circle cx="100" cy="100" r="88" stroke="currentColor" strokeDasharray="8 7"/><circle cx="100" cy="100" r="66" stroke="currentColor"/><path d="m100 13 75 87-75 87-75-87Zm0 39 40 48-40 48-40-48Z" stroke="currentColor" strokeWidth="2"/><path d="M100 25v150M25 100h150" stroke="currentColor" strokeWidth="1.5"/></svg></div>
  <div className="doom-sigil doom-sigil-b"><svg viewBox="0 0 200 200" fill="none"><circle cx="100" cy="100" r="90" stroke="currentColor" strokeWidth="2" strokeDasharray="4 12"/><circle cx="100" cy="100" r="70" stroke="currentColor"/><path d="M100 17 183 100 100 183 17 100Z M100 44 156 100 100 156 44 100Z M100 42v116M42 100h116" stroke="currentColor" strokeWidth="2"/></svg></div>
  <div className="doom-embers"/><div className="doom-vignette"/>
 </div>
);
