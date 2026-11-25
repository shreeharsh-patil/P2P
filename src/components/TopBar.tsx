import React from 'react';
import { BrandLogo } from './BrandLogo';
import { StatusIndicator, StatusKind } from './StatusIndicator';
import { WebRTCState } from '../network/WebRTCManager';

interface TopBarProps {
  webrtcState: WebRTCState;
  signalingConnected: boolean;
  sessionId: string | null;
}

const statusFor = (
  webrtcState: WebRTCState,
  signalingConnected: boolean,
  sessionId: string | null
): StatusKind => {
  if (webrtcState === 'connected') return 'connected';
  if (webrtcState === 'connecting') return 'connecting';
  if (sessionId) return 'waiting';
  return signalingConnected ? 'online' : 'offline';
};

export const TopBar: React.FC<TopBarProps> = React.memo(({
  webrtcState,
  signalingConnected,
  sessionId
}) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-[#050505]/75 px-4 pt-3 backdrop-blur-md sm:px-6 sm:pt-4">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 border border-[#381014] bg-[#080809]/90 px-4 shadow-[0_10px_35px_rgba(0,0,0,0.28)] sm:px-6">
        <BrandLogo size="sm" />
        <div className="mx-2 hidden flex-1 border-t border-[#252529] sm:block" />
        <div className="flex shrink-0 items-center border border-[#29292e] bg-[#09090a] px-3 py-2">
          <StatusIndicator
            status={statusFor(webrtcState, signalingConnected, sessionId)}
            size="sm"
          />
        </div>
      </div>
    </header>
  );
});
