import React,{useState} from 'react';
import { Camera, Link2, ArrowRight, ShieldPlus, ScanLine } from 'lucide-react';
interface LandingActionsProps { activeMode:'create'|'join'; onCreateSession:()=>void;onSelectJoin:()=>void;onJoinSession:(code:string)=>void;onOpenQRScanner:()=>void; }
export const LandingActions:React.FC<LandingActionsProps>=({activeMode,onCreateSession,onSelectJoin,onJoinSession,onOpenQRScanner})=>{
 const [code,setCode]=useState('');
 const handleJoin=(e:React.FormEvent)=>{e.preventDefault();if(code.trim().length>=6)onJoinSession(code.trim())};
 const paste=async()=>{try{const v=await navigator.clipboard.readText();const m=v.match(/\b\d{6}\b/)||v.match(/join=(\d{6})/);setCode(m?(m[1]||m[0]):v.trim())}catch{/* User can enter code manually. */}};
 return <section className="max-w-2xl mx-auto px-4 sm:px-6 w-full space-y-4">
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
   <button type="button" onClick={onCreateSession} className="doom-cta doom-cta-primary text-sm"><ShieldPlus className="w-5 h-5"/>Create Session<ArrowRight className="w-4 h-4"/></button>
   <button type="button" onClick={onSelectJoin} className="doom-cta doom-cta-secondary text-sm"><ScanLine className="w-5 h-5"/>Join Session</button>
  </div>
  {activeMode==='join'&&<form onSubmit={handleJoin} className="doom-terminal p-4 sm:p-6 space-y-4">
   <p className="doom-eyebrow">ENTER ACCESS CODE</p>
   <div className="flex gap-2">
    <input type="text" inputMode="numeric" autoFocus value={code} onChange={e=>setCode(e.target.value)} placeholder="6-DIGIT SESSION CODE" maxLength={10} aria-label="Session code" className="flex-1 min-w-0 bg-[#07110b] border border-[#345f3c] focus:border-[#a6ff75] rounded-lg px-3 py-3 text-center font-mono tracking-[.15em] text-[#e5ffd6] placeholder:text-[#59775b] focus:outline-none"/>
    <button type="button" onClick={onOpenQRScanner} title="Scan QR code" aria-label="Scan QR code" className="h-12 w-12 grid place-items-center rounded-lg border border-[#345f3c] text-[#abff74] hover:bg-[#23452b]"><Camera className="w-5 h-5"/></button>
   </div>
   <div className="flex gap-2">
    <button type="button" onClick={paste} className="inline-flex items-center gap-2 rounded-lg px-4 py-3 border border-[#345f3c] text-[#bcd7b2] hover:bg-[#183221] text-xs font-mono"><Link2 className="w-4 h-4"/>Paste</button>
    <button type="submit" disabled={code.trim().length<6} className="doom-cta doom-cta-primary flex-1 text-xs disabled:opacity-40">Connect<ArrowRight className="w-4 h-4"/></button>
   </div>
  </form>}
 </section>;
};
