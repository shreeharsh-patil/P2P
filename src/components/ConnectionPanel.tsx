import React from 'react';
import { ChevronDown } from 'lucide-react';
import { WebRTCState } from '../network/WebRTCManager';

interface ConnectionPanelProps {
  webrtcState: WebRTCState;
  sessionId: string | null;
  iceConnectionState?: string;
  dataChannelState?: string;
}

export const ConnectionPanel: React.FC<ConnectionPanelProps> = ({
  webrtcState,
  sessionId,
  iceConnectionState,
  dataChannelState
}) => {
  const isConnected = webrtcState === 'connected';

  const rows = [
    { label: 'Protocol', value: 'WebRTC' },
    { label: 'Network', value: isConnected ? 'Direct P2P' : 'P2P Standby' },
    { label: 'Data Channel', value: dataChannelState ? dataChannelState.toUpperCase() : (isConnected ? 'OPEN' : 'CLOSED') },
    { label: 'ICE State', value: iceConnectionState ? iceConnectionState.toUpperCase() : (isConnected ? 'CONNECTED' : webrtcState.toUpperCase()) },
    { label: 'Encryption', value: 'DTLS / SRTP' },
    { label: 'Server', value: 'Signaling only' },
    ...(sessionId ? [{ label: 'Session ID', value: `#${sessionId}` }] : [])
  ];

  return (
    <details className="tech-panel group bg-[#09090b] border border-[#1c1c22] overflow-hidden">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer list-none font-mono text-xs text-[#8a8a8a] hover:text-[#f2f2f2] transition-colors select-none [&::-webkit-details-marker]:hidden">
        <span className="tracking-[0.2em] uppercase">+ CONNECTION DETAILS</span>
        <ChevronDown className="w-4 h-4 transition-transform duration-200 group-open:rotate-180 text-[#ff3030]" />
      </summary>

      <div className="px-4 pb-4 pt-1 grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-[11px]">
        {rows.map((row) => (
          <div key={row.label} className="p-2 bg-[#050505] border border-[#18181c] rounded-xs space-y-0.5">
            <div className="text-[9px] text-[#4a4a4a] tracking-wider uppercase">{row.label}</div>
            <div className="text-[#f2f2f2] font-medium truncate">{row.value}</div>
          </div>
        ))}
      </div>
    </details>
  );
};
