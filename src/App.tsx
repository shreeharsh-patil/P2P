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
import { SettingsModal } from './components/SettingsModal';
import { Toast, ToastMessage } from './components/Toast';
import { TextMessageItem } from './components/TextTransfer';

import { SignalingClient } from './network/SignalingClient';
import { WebRTCManager, WebRTCState } from './network/WebRTCManager';
import { TransferManager } from './engine/TransferManager';
import { TransferItem } from './engine/types';
import { sounds } from './utils/audio';

type ViewState = 'landing' | 'host' | 'join' | 'waiting' | 'connected' | 'failed';

export const App: React.FC = () => {
  const signalingRef = useRef<SignalingClient | null>(null);
  const rtcRef = useRef<WebRTCManager | null>(null);
  const transferRef = useRef<TransferManager | null>(null);

  const [signalingConnected, setSignalingConnected] = useState(false);
  const [webrtcState, setWebrtcState] = useState<WebRTCState>('new');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>('landing');

  const [queue, setQueue] = useState<TransferItem[]>([]);
  const [textMessages, setTextMessages] = useState<TextMessageItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Modals
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Engine Preferences
  const [autoAcceptFiles, setAutoAcceptFiles] = useState<boolean>(() => {
    return localStorage.getItem('shree_auto_accept') === 'true';
  });
  const [chunkSize, setChunkSize] = useState<number>(60 * 1024);
  const [preferDirectSave, setPreferDirectSave] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

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
          setViewState('connected');
        } else if (state === 'failed') {
          showToast('error', 'WEBRTC NEGOTIATION FAILED');
          setViewState('failed');
        } else if (state === 'disconnected') {
          showToast('error', 'PEER DISCONNECTED');
          setViewState('failed');
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
      onError: (_id, err) => {
        showToast('error', `ERROR: ${err}`);
      },
      onOfferReceived: (item) => {
        showToast('info', `FILE OFFER: ${item.name}`);
      }
    });
    transfer.setAutoAccept(localStorage.getItem('shree_auto_accept') === 'true');
    transferRef.current = transfer;

    const extractJoinCodeFromUrl = (): string | null => {
      // 1. Check query parameters (?join=123456)
      const searchParams = new URLSearchParams(window.location.search);
      const searchCode = searchParams.get('join');
      if (searchCode && searchCode.trim()) return searchCode.trim();

      // 2. Check hash (#join=123456 or #/join/123456)
      if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        const match = hash.match(/\b\d{6}\b/) || hash.match(/join[=/]([A-Za-z0-9-]+)/i);
        if (match) return (match[1] || match[0]).trim();
      }

      // 3. Check pathname (/join/123456)
      const pathMatch = window.location.pathname.match(/\/join\/([A-Za-z0-9-]+)/i);
      if (pathMatch) return pathMatch[1].trim();

      return null;
    };

    const joinCode = extractJoinCodeFromUrl();
    if (joinCode) {
      setSessionId(joinCode);
      setViewState('waiting');
      showToast('info', `AUTO-JOINING SESSION #${joinCode}...`);
      signaling.joinSession(joinCode);
      // Clean URL bar to prevent reload loop
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {}
    }

    signaling.connect().then(() => {
      setSignalingConnected(true);
    }).catch((err) => {
      console.error('Signaling connection failed', err);
      showToast('error', 'SIGNALING SERVER UNREACHABLE — RETRYING...');
    });

    signaling.on('SESSION_CREATED', (msg) => {
      if (msg.sessionId) {
        setSessionId(msg.sessionId);
        setViewState('host');
      }
    });

    signaling.on('SESSION_JOINED', (msg) => {
      // Client confirmed to have joined the session — now wait for host's WebRTC offer
      if (msg.sessionId) {
        setSessionId(msg.sessionId);
        if (msg.targetPeerId) {
          rtc.setTargetPeerId(msg.targetPeerId);
        }
        // Move to "waiting" — do NOT go back to join screen
        setViewState('waiting');
        showToast('info', `SESSION #${msg.sessionId} JOINED — WAITING FOR HOST...`);
      }
    });

    signaling.on('PEER_JOINED', (msg) => {
      // Host receives this when a client joins — initiate WebRTC offer immediately
      if (msg.peerId) {
        showToast('info', 'PEER CONNECTED — INITIATING HANDSHAKE...');
        setViewState('waiting');
        rtc.initiateConnection(msg.peerId);
      }
    });

    signaling.on('ERROR', (msg) => {
      showToast('error', msg.error || 'Session error. Please check the code.');
      setViewState('join');
      setSessionId(null);
    });

    signaling.on('PEER_LEFT', () => {
      // The signaling socket can be suspended when a browser is minimized, while
      // the direct WebRTC data channels remain usable. Do not tear down that live
      // session solely because signaling reports that the peer left.
      if (rtc.areChannelsOpen() && !rtc.isWebSocketRelayMode) {
        showToast('info', 'SIGNALING PEER PAUSED — KEEPING DIRECT CONNECTION ACTIVE');
        return;
      }

      showToast('error', 'REMOTE PEER DISCONNECTED');
      setWebrtcState('disconnected');
      setViewState('landing');
      setSessionId(null);
    });

    return () => {
      signaling.disconnect();
      rtc.close();
      transfer.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateSession = () => {
    if (signalingRef.current) {
      signalingRef.current.createSession();
      showToast('info', 'GENERATING SESSION CODE...');
    }
  };

  const handleJoinSession = (code: string) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    if (signalingRef.current) {
      setSessionId(trimmedCode);
      setViewState('waiting');
      signalingRef.current.joinSession(trimmedCode);
      showToast('info', `JOINING SESSION #${trimmedCode}...`);
    }
  };

  const handleDisconnect = () => {
    if (rtcRef.current) {
      rtcRef.current.close();
    }
    if (transferRef.current) {
      transferRef.current.destroy();
    }
    setWebrtcState('new');
    setSessionId(null);
    setViewState('landing');
    setQueue([]);
    setTextMessages([]);
    showToast('info', 'P2P SESSION TERMINATED');
  };

  // Transfer Engine Handlers
  const handleOfferFiles = async (files: FileList | File[]) => {
    if (transferRef.current) {
      const batchId = Math.random().toString(36).substring(2, 9);
      for (const file of Array.from(files)) {
        const relPath = (file as any).webkitRelativePath || file.name;
        try {
          await transferRef.current.offerFile(file, relPath, batchId);
        } catch (error) {
          console.error('Failed to offer file', error);
          showToast('error', `FAILED TO OFFER: ${file.name}`);
        }
      }
      showToast('info', `OFFERING ${files.length} FILE(S) TO PEER`);
    }
  };

  const handleOfferScannedFiles = async (scannedFiles: { file: File; relativePath: string }[]) => {
    if (transferRef.current && scannedFiles.length > 0) {
      const batchId = Math.random().toString(36).substring(2, 9);
      for (const { file, relativePath } of scannedFiles) {
        try {
          await transferRef.current.offerFile(file, relativePath, batchId);
        } catch (error) {
          console.error('Failed to offer file', error);
          showToast('error', `FAILED TO OFFER: ${file.name}`);
        }
      }
      showToast('info', `OFFERING ${scannedFiles.length} ITEM(S) TO PEER`);
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

  const handleAcceptAllOffers = () => {
    if (transferRef.current) {
      transferRef.current.acceptAllOffers(preferDirectSave);
      showToast('info', 'ACCEPTED ALL INCOMING OFFERS');
    }
  };

  const handleRejectAllOffers = () => {
    if (transferRef.current) {
      transferRef.current.rejectAllOffers();
      showToast('info', 'DECLINED ALL INCOMING OFFERS');
    }
  };

  const handlePauseAll = () => {
    if (transferRef.current) {
      transferRef.current.pauseAll();
    }
  };

  const handleResumeAll = () => {
    if (transferRef.current) {
      transferRef.current.resumeAll();
    }
  };

  const handleCancelAll = () => {
    if (transferRef.current) {
      transferRef.current.cancelAll();
      showToast('info', 'CANCELLED ALL ACTIVE TRANSFERS');
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

  const handleToggleAutoAccept = () => {
    setAutoAcceptFiles((prev) => {
      const next = !prev;
      localStorage.setItem('shree_auto_accept', String(next));
      if (transferRef.current) {
        transferRef.current.setAutoAccept(next);
      }
      showToast('info', next ? 'AUTO-ACCEPT TRANSFERS: ENABLED' : 'AUTO-ACCEPT TRANSFERS: DISABLED');
      return next;
    });
  };

  const handleAutoAcceptChange = (val: boolean) => {
    setAutoAcceptFiles(val);
    localStorage.setItem('shree_auto_accept', String(val));
    if (transferRef.current) {
      transferRef.current.setAutoAccept(val);
    }
    showToast('info', val ? 'AUTO-ACCEPT TRANSFERS: ENABLED' : 'AUTO-ACCEPT TRANSFERS: DISABLED');
  };

  const handleChunkSizeChange = (size: number) => {
    setChunkSize(size);
    if (transferRef.current) {
      transferRef.current.setChunkSize(size);
    }
  };

  const handleSoundToggle = () => {
    setSoundEnabled((prev) => {
      sounds.enabled = !prev;
      return !prev;
    });
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
          onOpenSettings={() => setIsSettingsModalOpen(true)}
        />

        <main className="flex-1 w-full max-w-[960px] mx-auto py-8">

          {/* ============ CONNECTED WORKSPACE ============ */}
          {viewState === 'connected' ? (
            <ConnectedScreen
              queue={queue}
              isConnected={true}
              autoAcceptFiles={autoAcceptFiles}
              onToggleAutoAccept={handleToggleAutoAccept}
              webrtcState={webrtcState}
              sessionId={sessionId}
              textMessages={textMessages}
              onOfferFiles={handleOfferFiles}
              onOfferScannedFiles={handleOfferScannedFiles}
              onAcceptOffer={handleAcceptOffer}
              onRejectOffer={handleRejectOffer}
              onAcceptAllOffers={handleAcceptAllOffers}
              onRejectAllOffers={handleRejectAllOffers}
              onPauseAll={handlePauseAll}
              onResumeAll={handleResumeAll}
              onCancelAll={handleCancelAll}
              onPauseTransfer={handlePauseTransfer}
              onResumeTransfer={handleResumeTransfer}
              onCancelTransfer={handleCancelTransfer}
              onSendText={handleSendText}
              onDisconnect={handleDisconnect}
            />

          ) : viewState === 'waiting' ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in-up font-mono">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-2 border-[rgba(255,48,48,0.15)]" />
                <div className="absolute inset-0 rounded-full border-t-2 border-[#ff3030] animate-spin" />
                <div className="absolute inset-[6px] rounded-full border-t-2 border-[rgba(255,48,48,0.4)] animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }} />
              </div>
              <div className="text-center space-y-2">
                <p className="text-sm text-[#ff3030] tracking-[0.25em] uppercase font-bold animate-pulse">
                  ESTABLISHING ENCRYPTED TUNNEL
                </p>
                {sessionId && (
                  <p className="text-xs text-[#555] tracking-widest">
                    SESSION: <span className="text-[#888]">{sessionId}</span>
                  </p>
                )}
                <p className="text-xs text-[#444] mt-4 max-w-xs mx-auto leading-relaxed">
                  Negotiating WebRTC DataChannel via STUN/TURN.<br />This may take 10–30 seconds.
                </p>
              </div>
              <button
                onClick={handleDisconnect}
                className="mt-4 px-5 py-2 text-xs font-mono text-rose-400 border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 uppercase tracking-wider transition-colors"
              >
                CANCEL
              </button>
            </div>

          /* ============ FAILED / RETRY ============ */
          ) : viewState === 'failed' ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in-up font-mono">
              <div className="w-16 h-16 flex items-center justify-center border-2 border-rose-500/50 rounded-full text-rose-400 text-3xl">
                ✕
              </div>
              <div className="text-center space-y-3">
                <p className="text-sm text-rose-400 tracking-[0.25em] uppercase font-bold">
                  CONNECTION FAILED
                </p>
                <p className="text-xs text-[#555] max-w-xs mx-auto leading-relaxed">
                  WebRTC could not establish a direct channel.<br />
                  Check the browser console (F12) for detailed diagnostics.
                </p>
              </div>
              {rtcRef.current && (
                <pre className="text-[10px] text-[#555] bg-[#0a0a0a] border border-[#1a1a1a] p-3 rounded max-w-sm w-full text-left whitespace-pre-wrap">
                  {rtcRef.current.getDiagnostics()}
                </pre>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    handleDisconnect();
                    setTimeout(() => handleCreateSession(), 100);
                  }}
                  className="px-5 py-2 text-xs font-mono text-[#ff3030] border border-[#ff3030]/40 bg-[#ff3030]/10 hover:bg-[#ff3030]/20 uppercase tracking-wider transition-colors"
                >
                  NEW SESSION
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-5 py-2 text-xs font-mono text-[#888] border border-[#333] hover:border-[#555] uppercase tracking-wider transition-colors"
                >
                  GO HOME
                </button>
              </div>
            </div>      

          /* ============ HOST SCREEN ============ */
          ) : viewState === 'host' && sessionId ? (
            <HostScreen
              sessionId={sessionId}
              webrtcState={webrtcState}
              onRegenerateSession={handleCreateSession}
              onBack={() => { setViewState('landing'); setSessionId(null); }}
            />

          /* ============ JOIN SCREEN ============ */
          ) : viewState === 'join' ? (
            <JoinScreen
              onJoinSession={handleJoinSession}
              onOpenQRScanner={() => setIsQRScannerOpen(true)}
              onBack={() => setViewState('landing')}
            />

          /* ============ LANDING ============ */
          ) : (
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
          setIsQRScannerOpen(false);
          handleJoinSession(code);
        }}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        chunkSize={chunkSize}
        onChunkSizeChange={handleChunkSizeChange}
        preferDirectSave={preferDirectSave}
        onPreferDirectSaveChange={setPreferDirectSave}
        autoAcceptFiles={autoAcceptFiles}
        onAutoAcceptFilesChange={handleAutoAcceptChange}
        soundEnabled={soundEnabled}
        onSoundToggle={handleSoundToggle}
      />

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default App;
