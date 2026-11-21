import React from 'react';
import { BrandLogo } from './BrandLogo';
import { StatusIndicator, StatusKind } from './StatusIndicator';
import { WebRTCState } from '../network/WebRTCManager';
import { Settings2 } from 'lucide-react';
interface TopBarProps {webrtcState:WebRTCState;signalingConnected:boolean;sessionId:string|null;onOpenSettings?:()=>void;}
const statusFor=(state:WebRTCState,signaling:boolean,session:string|null):StatusKind=>{
 if(state==='connected')return 'connected';if(state==='connecting')return 'connecting';if(session)return 'waiting';return signaling?'online':'offline';
};
export const TopBar:React.FC<TopBarProps>=({webrtcState,signalingConnected,sessionId,onOpenSettings})=>(
 <header className="doom-topbar sticky top-0 z-40 w-full">
  <div className="max-w-6xl mx-auto h-[72px] px-4 sm:px-8 flex items-center justify-between">
   <BrandLogo size="sm"/>
   <div className="flex items-center gap-3 sm:gap-5">
    <span className="hidden sm:inline doom-badge">LATVERIAN NETWORK</span>
    <StatusIndicator status={statusFor(webrtcState,signalingConnected,sessionId)} size="sm"/>
    {onOpenSettings&&<button type="button" title="Settings" aria-label="Open settings" onClick={onOpenSettings} className="h-10 w-10 grid place-items-center rounded-xl border border-[#315d38] text-[#b8eaa6] bg-[#0c1c12] hover:border-[#9cff63] hover:text-[#c4ff95] transition-colors"><Settings2 className="w-4 h-4"/></button>}
   </div>
  </div>
 </header>
);
