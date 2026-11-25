import React, { useState } from 'react';
import { Camera, Link2, ArrowRight, ArrowUpRight, Fingerprint, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';

interface LandingActionsProps {
  activeMode: 'create' | 'join';
  onCreateSession: () => void;
  onSelectJoin: () => void;
  onJoinSession: (code: string) => void;
  onOpenQRScanner: () => void;
}

export const LandingActions: React.FC<LandingActionsProps> = ({
  activeMode,
  onCreateSession,
  onSelectJoin,
  onJoinSession,
  onOpenQRScanner
}) => {
  const [inputCode, setInputCode] = useState('');

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim().length >= 6) {
      onJoinSession(inputCode.trim());
    }
  };

  const handlePasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const match = text.match(/\b\d{6}\b/) || text.match(/join=(\d{6})/);
        if (match) {
          setInputCode(match[1] || match[0]);
        } else {
          setInputCode(text.trim());
        }
      }
    } catch (e) {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="landing-actions w-full">
      <Card className="action-card">
        <CardHeader className="action-card-header">
          <div className="action-icon"><Fingerprint size={17} /></div>
          <div className="min-w-0">
            <CardTitle>Start a private session</CardTitle>
            <CardDescription>Choose how you want to connect.</CardDescription>
          </div>
          <span className="action-index">01 / 02</span>
        </CardHeader>
        <CardContent className="action-card-content">
          <Button type="button" size="lg" className="w-full justify-between" onClick={onCreateSession}>
            <span className="inline-flex items-center gap-2"><Plus size={16} /> Create new session</span><ArrowUpRight size={16} />
          </Button>
          <Button type="button" variant="secondary" size="lg" className="w-full justify-between" onClick={onSelectJoin}>
            <span>Join an existing session</span><ArrowRight size={16} />
          </Button>
          <div className="action-card-note"><span className="action-note-dot" /> A short code is all your peer needs</div>
        </CardContent>
      </Card>

      {activeMode === 'join' && (
        <form onSubmit={handleJoinSubmit} className="tech-panel p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="ENTER 6-DIGIT CODE"
              maxLength={10}
              autoFocus
              className="flex-1 text-center font-mono text-lg tracking-[0.2em]"
            />
            <Button
              type="button"
              onClick={onOpenQRScanner}
              variant="aqua"
              size="icon"
              title="Scan QR Code with camera"
            >
              <Camera className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handlePasteCode}
              variant="ghost"
              size="sm"
            >
              <Link2 className="w-3.5 h-3.5" />
              Paste
            </Button>
            <Button
              type="submit"
              disabled={inputCode.trim().length < 6}
              className="flex-1 justify-center"
            >
              Connect
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
