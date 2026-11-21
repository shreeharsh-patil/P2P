import React from 'react';
import {ShieldCheck,Zap,LockKeyhole} from 'lucide-react';
export const Hero:React.FC=()=>(
 <section className="doom-hero max-w-5xl mx-auto px-4 sm:px-6">
  <div className="doom-hero-content">
   <div className="doom-overline">✦ LATVERIAN TRANSMISSION PROTOCOL ✦</div>
   <div className="doom-hero-emblem"><img src="/doom/doom-favicon.png" alt="Dr Doom emblem"/></div>
   <h1 className="doom-title">DR <span>DOOM</span></h1>
   <p className="doom-subtitle">PRIVATE. DIRECT. UNYIELDING.</p>
   <p className="doom-intro">Establish a secure connection between devices. Transfer files and messages directly, powered by peer-to-peer technology.</p>
   <div className="doom-benefits">
    <span><ShieldCheck size={15}/> Private transfer</span>
    <span><Zap size={15}/> Direct connection</span>
    <span><LockKeyhole size={15}/> Encrypted channel</span>
   </div>
  </div>
 </section>
);