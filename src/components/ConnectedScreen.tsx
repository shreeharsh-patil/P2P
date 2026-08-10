import React from 'react';
import { FileTransfer } from './FileTransfer';
import { TextTransfer, TextMessageItem } from './TextTransfer';
import { ConnectionPanel } from './ConnectionPanel';
import { TransferItem } from '../engine/types';
import { WebRTCState } from '../network/WebRTCManager';

interface ConnectedScreenProps {
  queue: TransferItem[];
  isConnected: boolean;
  canTransfer?: boolean;
  webrtcState: WebRTCState;
  sessionId: string | null;
  textMessages: TextMessageItem[];
  onOfferFiles: (files: FileList | File[]) => void;
  onAcceptOffer: (id: string) => void;
  onRejectOffer: (id: string) => void;
  onPauseTransfer: (id: string) => void;
  onResumeTransfer: (id: string) => void;
  onCancelTransfer: (id: string) => void;
  onSendText: (text: string) => void;
  onDisconnect: () => void;
}

export const ConnectedScreen: React.FC<ConnectedScreenProps> = ({
  queue,
  isConnected,
  canTransfer = true,
  webrtcState,
  sessionId,
  textMessages,
  onOfferFiles,
  onAcceptOffer,
  onRejectOffer,
  onPauseTransfer,
  onResumeTransfer,
  onCancelTransfer,
  onSendText,
  onDisconnect
}) => {
  return (
    <div className="w-full max-w-[960px] mx-auto px-4 sm:px-6 space-y-8 font-mono">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[rgba(255,255,255,0.08)] pb-4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff3030] shadow-[0_0_8px_#ff3030]" />
          <h2 className="font-mono font-bold text-sm sm:text-base text-white tracking-wider uppercase">
            CONNECTED TO PEER
          </h2>
        </div>

        <div className="flex items-center gap-4 text-xs text-[#a0a0a0]">
          {sessionId && (
            <span>
              SESSION: <span className="text-[#ff3030] font-bold">{sessionId}</span>
            </span>
          )}
          <button
            onClick={onDisconnect}
            className="px-3 py-1 text-[11px] font-mono font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xs uppercase tracking-wider transition-colors"
          >
            DISCONNECT
          </button>
        </div>
      </div>

      {/* FILE TRANSFER & TEXT CHANNEL WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <FileTransfer
            queue={queue}
            canTransfer={canTransfer ?? isConnected}
            onOfferFiles={onOfferFiles}
            onAcceptOffer={onAcceptOffer}
            onRejectOffer={onRejectOffer}
            onPauseTransfer={onPauseTransfer}
            onResumeTransfer={onResumeTransfer}
            onCancelTransfer={onCancelTransfer}
          />
        </div>

        <div className="lg:col-span-1 space-y-6">
          <TextTransfer
            messages={textMessages}
            isConnected={isConnected}
            onSendText={onSendText}
          />
        </div>
      </div>

      {/* TECHNICAL CONNECTION PANEL */}
      <ConnectionPanel webrtcState={webrtcState} sessionId={sessionId} />
    </div>
  );
};
