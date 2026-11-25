import React, { useState } from 'react';
import { Camera, Link2, ArrowRight, Plus, ScanLine } from 'lucide-react';
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
    <div className="w-full">
      <Card className="mx-auto w-full max-w-xl overflow-hidden border-white/[0.09] bg-[#0b0b0d]/95 lg:max-w-none">
        <CardHeader className="space-y-2 border-b border-white/[0.06] px-6 pb-5 pt-6 sm:px-7">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ff666b]">Get started</p>
          <CardTitle className="text-xl tracking-tight sm:text-2xl">Connect your devices</CardTitle>
          <CardDescription className="leading-relaxed">Create a private session or join one with a code.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 px-6 pb-6 pt-5 sm:px-7 sm:pb-7">
          <Button size="lg" onClick={onCreateSession} className="w-full justify-between rounded-lg px-5 font-mono text-xs uppercase tracking-[0.14em]">
            <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Create session</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={onSelectJoin}
            className={`w-full justify-between rounded-lg px-5 font-mono text-xs uppercase tracking-[0.14em] ${activeMode === 'join' ? 'border-[#ff3a40]/65 bg-[#ff2b2b]/[0.06] text-[#ff7277]' : ''}`}
          >
            <span className="flex items-center gap-2"><ScanLine className="h-4 w-4" /> Join session</span>
            <ArrowRight className="h-4 w-4" />
          </Button>

          {activeMode === 'join' && (
            <form onSubmit={handleJoinSubmit} className="space-y-3 border-t border-white/[0.07] pt-4">
              <div className="flex items-center gap-2">
                <Input
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={10}
                  autoFocus
                  className="text-center font-mono text-lg tracking-[0.2em]"
                />
                <Button type="button" variant="outline" size="icon" onClick={onOpenQRScanner} title="Scan QR Code with camera" aria-label="Scan QR code">
                  <Camera className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={handlePasteCode} className="px-3">
                  <Link2 className="h-3.5 w-3.5" /> Paste
                </Button>
                <Button type="submit" disabled={inputCode.trim().length < 6} className="flex-1 font-mono text-xs uppercase tracking-wider">
                  Connect <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
