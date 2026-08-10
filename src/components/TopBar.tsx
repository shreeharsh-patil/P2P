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

export const TopBar: React.FC<TopBarProps> = ({
  webrtcState,
  signalingConnected,
  sessionId
}) => {
  return (
    <header className="w-full border-b border-[#1c1c22] bg-[#050505]/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <BrandLogo size="sm" />

        {/* Status Indicator */}
        <div className="flex items-center gap-3 sm:gap-4">
          <StatusIndicator
            status={statusFor(webrtcState, signalingConnected, sessionId)}
            size="sm"
          />
        </div>
      </div>
    </header>
  );
};
