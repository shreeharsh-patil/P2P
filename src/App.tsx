import React, { useEffect, useRef, useState } from 'react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { TopBar } from './components/TopBar';
import { Hero } from './components/Hero';
import { LandingActions } from './components/LandingActions';
import { HostScreen } from './components/HostScreen';
import { JoinScreen } from './components/JoinScreen';
import { ConnectedScreen } from './components/ConnectedScreen';
import { HowItWorks } from './components/HowItWorks';
import { Footer } from './components/Footer';
import { QRCodeModal } from './components/QRCodeModal';
import { QRScannerModal } from './components/QRScannerModal';
import { Toast, ToastMessage } from './components/Toast';
import { TextMessageItem } from './components/TextTransfer';

import { SignalingClient } from './network/SignalingClient';
import { WebRTCManager, WebRTCState } from './network/WebRTCManager';
import { TransferManager } from './engine/TransferManager';
import { TransferItem } from './engine/types';
import { sounds } from './utils/audio';

export const App: React.FC = () => {
  const signalingRef = useRef<SignalingClient | null>(null);
  const rtcRef = useRef<WebRTCManager | null>(null);
  const transferRef = useRef<TransferManager | null>(null);

  const [signalingConnected, setSignalingConnected] = useState(false);
  const [webrtcState, setWebrtcState] = useState<WebRTCState>('new');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const [viewState, setViewState] = useState<'landing' | 'host' | 'join'>('landing');

  const [queue, setQueue] = useState<TransferItem[]>([]);
  const [textMessages, setTextMessages] = useState<TextMessageItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Modals
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);

  // Engine Preferences
  const [preferDirectSave] = useState<boolean>(false);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Initialize Network & Transfer Engine
  useEffect(() => {
    const signaling = new SignalingClient();
    signalingRef.current = signaling;

    const rtc = new WebRTCManager(signaling, {
      onStateChange: (state) => {
        setWebrtcState(state);
        if (state === 'connected') {
          sounds.playConnect();
          showToast('success', 'DIRECT P2P DATACHANNEL CONNECTED');
        }
      },
      onTextMessage: (text, senderId, timestamp) => {
        setTextMessages((prev) => [
          ...prev,
          { id: Math.random().toString(36).substring(2, 9), sender: 'peer', text, timestamp }
        ]);
        sounds.playConnect();
        showToast('info', 'TEXT PAYLOAD RECEIVED');
      }
    });
    rtcRef.current = rtc;

    const transfer = new TransferManager(rtc, {
      onQueueUpdated: (newQueue) => setQueue([...newQueue]),
      onTransferCompleted: (item) => {
        sounds.playComplete();
        showToast('success', `VERIFIED: ${item.name}`);
      },
      onError: (id, err) => {
        showToast('error', `ERROR: ${err}`);
      },
      onOfferReceived: (item) => {
        showToast('info', `FILE OFFER: ${item.name}`);
      }
    });
    transferRef.current = transfer;

    signaling.connect().then(() => {
      setSignalingConnected(true);

      const urlParams = new URLSearchParams(window.location.search);
      const joinCode = urlParams.get('join');
      if (joinCode) {
        setViewState('join');
        handleJoinSession(joinCode);
      }
    }).catch((err) => {
      console.error('Signaling connection failed', err);
      showToast('error', 'SIGNALING SERVER UNREACHABLE');
    });

    signaling.on('SESSION_CREATED', (msg) => {
      if (msg.sessionId) {
        setSessionId(msg.sessionId);
        setViewState('host');
      }
    });

    signaling.on('SESSION_JOINED', (msg) => {
      if (msg.sessionId) {
        setSessionId(msg.sessionId);
        if (msg.targetPeerId) {
          rtc.setTargetPeerId(msg.targetPeerId);
        }
        setViewState('join');
        showToast('info', `JOINED SESSION #${msg.sessionId} — ESTABLISHING WEBRTC...`);
      }
    });

    signaling.on('PEER_JOINED', (msg) => {
      if (msg.peerId) {
        showToast('info', 'REMOTE PEER JOINED SESSION. INITIATING WEBRTC...');
        rtc.initiateConnection(msg.peerId);
      }
    });

    signaling.on('PEER_LEFT', () => {
      showToast('error', 'REMOTE PEER DISCONNECTED');
      setWebrtcState('disconnected');
    });

    return () => {
      signaling.disconnect();
      rtc.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateSession = () => {
    if (signalingRef.current) {
      signalingRef.current.createSession();
      showToast('info', 'NEW SESSION CODE GENERATED');
    }
  };

  const handleJoinSession = (code: string) => {
    if (signalingRef.current) {
      setSessionId(code);
      signalingRef.current.joinSession(code);
      showToast('info', `JOINING SESSION #${code}...`);
    }
  };

  const handleDisconnect = () => {
    if (rtcRef.current) {
      rtcRef.current.close();
    }
    setWebrtcState('disconnected');
    setSessionId(null);
    setViewState('landing');
    showToast('info', 'P2P SESSION TERMINATED');
  };

  // Transfer Engine Handlers
  const handleOfferFiles = (files: FileList | File[]) => {
    if (transferRef.current) {
      Array.from(files).forEach((file) => {
        transferRef.current!.offerFile(file);
      });
      showToast('info', `OFFERING ${files.length} FILE(S) TO PEER`);
    }
  };

  const handleAcceptOffer = (id: string) => {
    if (transferRef.current) {
      transferRef.current.acceptOffer(id, preferDirectSave);
    }
  };

  const handleRejectOffer = (id: string) => {
    if (transferRef.current) {
      transferRef.current.rejectOffer(id);
    }
  };

  const handlePauseTransfer = (id: string) => {
    if (transferRef.current) {
      transferRef.current.pauseTransfer(id);
    }
  };

  const handleResumeTransfer = (id: string) => {
    if (transferRef.current) {
      transferRef.current.resumeTransfer(id);
    }
  };

  const handleCancelTransfer = (id: string) => {
    if (transferRef.current) {
      transferRef.current.cancelTransfer(id);
    }
  };

  const handleSendText = (text: string) => {
    if (rtcRef.current) {
      const sent = rtcRef.current.sendTextMessage(text);
      if (sent) {
        setTextMessages((prev) => [
          ...prev,
          { id: Math.random().toString(36).substring(2, 9), sender: 'me', text, timestamp: Date.now() }
        ]);
      }
    }
  };

  const isConnected = webrtcState === 'connected';

  return (
    <div className="min-h-screen bg-[#050505] text-[#f2f2f2] flex flex-col font-sans relative overflow-x-hidden">
      {/* Animated Technical Background */}
      <AnimatedBackground />

      {/* Main Content Layer */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <TopBar
          webrtcState={webrtcState}
          signalingConnected={signalingConnected}
          sessionId={sessionId}
        />

        <main className="flex-1 w-full max-w-[960px] mx-auto py-8">
          {/* ============ CONNECTED VIEW (ACTIVE TRANSFER WORKSPACE) ============ */}
          {isConnected ? (
            <ConnectedScreen
              queue={queue}
              isConnected={isConnected}
              webrtcState={webrtcState}
              sessionId={sessionId}
              textMessages={textMessages}
              onOfferFiles={handleOfferFiles}
              onAcceptOffer={handleAcceptOffer}
              onRejectOffer={handleRejectOffer}
              onPauseTransfer={handlePauseTransfer}
              onResumeTransfer={handleResumeTransfer}
              onCancelTransfer={handleCancelTransfer}
              onSendText={handleSendText}
              onDisconnect={handleDisconnect}
            />
          ) : viewState === 'host' && sessionId ? (
            /* ============ HOST SCREEN ============ */
            <HostScreen
              sessionId={sessionId}
              webrtcState={webrtcState}
              onRegenerateSession={handleCreateSession}
              onBack={() => setViewState('landing')}
            />
          ) : viewState === 'join' ? (
            /* ============ JOIN SCREEN ============ */
            <JoinScreen
              onJoinSession={handleJoinSession}
              onOpenQRScanner={() => setIsQRScannerOpen(true)}
              onBack={() => setViewState('landing')}
            />
          ) : (
            /* ============ LANDING VIEW ============ */
            <div className="space-y-12">
              <Hero />

              <LandingActions
                onCreateSession={handleCreateSession}
                onSelectJoin={() => setViewState('join')}
                onJoinSession={handleJoinSession}
                onOpenQRScanner={() => setIsQRScannerOpen(true)}
                activeMode="create"
              />

              <div id="how-it-works">
                <HowItWorks />
              </div>
            </div>
          )}
        </main>

        <Footer />
      </div>

      {/* Modals & Notifications */}
      {sessionId && (
        <QRCodeModal
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          sessionId={sessionId}
        />
      )}

      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScanSuccess={(code) => {
          handleJoinSession(code);
        }}
      />

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default App;
