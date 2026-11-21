import React,{useState} from 'react';
import {Camera,Link2,ArrowRight,Crown,ScanLine} from 'lucide-react';
interface LandingActionsProps {
 activeMode:'create'|'join';onCreateSession:()=>void;onSelectJoin:()=>void;onJoinSession:(code:string)=>void;onOpenQRScanner:()=>void;
}
export const LandingActions:React.FC<LandingActionsProps>=({activeMode,onCreateSession,onSelectJoin,onJoinSession,onOpenQRScanner})=>{
 const [inputCode,setInputCode]=useState('');
 const submit=(e:React.FormEvent)=>{e.preventDefault();if(/^\d{6}$/.test(inputCode.trim()))onJoinSession(inputCode.trim());};
 const paste=async()=>{try{const raw=await navigator.clipboard.readText();const m=raw.match(/(?:join=|\/join\/)?(\d{6})/);if(m)setInputCode(m[1]);}catch{/* Clipboard permission denied */}};
 return <div className="doom-actions max-w-xl mx-auto w-full">
  <div className="doom-actions-title">CHOOSE YOUR CONNECTION</div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   <button type="button" onClick={onCreateSession} className="doom-action-primary">
    <Crown size={19}/><span><strong>CREATE A SESSION</strong><small>Host a secure connection</small></span><ArrowRight size={16}/>
   </button>
   <button type="button" onClick={onSelectJoin} aria-expanded={activeMode==='join'} className={'doom-action-secondary '+(activeMode==='join'?'active':'')}>
    <ScanLine size={20}/><span><strong>JOIN A SESSION</strong><small>Connect to another device</small></span><ArrowRight size={16}/>
   </button>
  </div>
  {activeMode==='join'&&<form onSubmit={submit} className="doom-join-panel animate-fade-in-up">
   <label htmlFor="doom-session-code" className="doom-actions-title">ENTER THE SIX-DIGIT SESSION CODE</label>
   <div className="flex items-center gap-2">
    <input id="doom-session-code" inputMode="numeric" type="text" autoComplete="off" value={inputCode} onChange={e=>setInputCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000" maxLength={6} className="doom-join-input min-w-0 flex-1"/>
    <button type="button" onClick={onOpenQRScanner} className="doom-icon-button" title="Scan QR code" aria-label="Scan QR code"><Camera size={20}/></button>
   </div>
   <div className="flex gap-2 mt-3">
    <button type="button" className="doom-secondary-button" onClick={paste}><Link2 size={14}/> PASTE CODE</button>
    <button type="submit" className="doom-primary-button flex-1" disabled={!/^\d{6}$/.test(inputCode)}>CONNECT <ArrowRight size={17}/></button>
   </div>
  </form>}
 </div>;
};