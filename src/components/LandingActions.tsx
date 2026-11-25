import React, { useState } from 'react';
import { Camera, Link2, ArrowRight, ChevronRight } from 'lucide-react';
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
    <div className="mx-auto w-full max-w-[480px] space-y-3">
      <Button
        variant="panel"
        size="lg"
        onClick={onCreateSession}
        className="group h-auto min-h-[92px] w-full justify-start whitespace-normal rounded-md border-[#29292f] bg-[#09090b]/95 px-5 py-4 text-left hover:border-[#ff3a40]/55 hover:bg-[#0d0d10]"
      >
        <span className="flex w-full items-center gap-4">
          <span className="flex h-9 min-w-9 items-center justify-center border border-[#ff3a40]/25 bg-[#ff2b2b]/[0.05] px-2 font-mono text-[11px] text-[#ff686e]">[H]</span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            <span className="font-mono text-sm font-semibold tracking-[0.14em]">HOST</span>
            <span className="text-xs font-normal normal-case tracking-normal text-[#929297]">Generate a connection code</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#77777d] transition-transform group-hover:translate-x-0.5 group-hover:text-[#ff686e]" />
        </span>
      </Button>

      <Button
        variant="panel"
        size="lg"
        onClick={onSelectJoin}
        className={`group h-auto min-h-[92px] w-full justify-start whitespace-normal rounded-md px-5 py-4 text-left ${activeMode === 'join' ? 'border-[#ff3a40]/60 bg-[#0d0d10]' : 'border-[#29292f] bg-[#09090b]/95'} hover:border-[#ff3a40]/55 hover:bg-[#0d0d10]`}
      >
        <span className="flex w-full items-center gap-4">
          <span className="flex h-9 min-w-9 items-center justify-center border border-[#ff3a40]/25 bg-[#ff2b2b]/[0.05] px-2 font-mono text-[11px] text-[#ff686e]">[J]</span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            <span className="font-mono text-sm font-semibold tracking-[0.14em]">JOIN</span>
            <span className="text-xs font-normal normal-case tracking-normal text-[#929297]">Enter or scan a session code</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#77777d] transition-transform group-hover:translate-x-0.5 group-hover:text-[#ff686e]" />
        </span>
      </Button>

      {activeMode === 'join' && (
        <Card className="border-[#29292f] bg-[#09090b]/95">
          <CardHeader className="pb-3">
            <CardTitle className="font-mono text-sm tracking-wider">Join a session</CardTitle>
            <CardDescription>Enter the six-digit code or scan its QR code.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={handleJoinSubmit} className="space-y-3">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
};
