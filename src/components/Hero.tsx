import React from 'react';
import { ArrowDownToLine, LockKeyhole, RadioTower } from 'lucide-react';
import { Badge } from './ui/badge';

export const Hero: React.FC = () => (
  <section className="hero-copy animate-view-enter">
    <Badge variant="muted" className="hero-badge"><RadioTower size={13} /> PRIVATE PEER NETWORK</Badge>
    <h1 className="hero-title">Your files.<br /><span>Your way.</span></h1>
    <p className="hero-description">Move files and messages directly between devices. No accounts, no cloud storage, just a private connection.</p>
    <div className="hero-proof">
      <span><LockKeyhole size={15} /> End-to-end encrypted channel</span>
      <span><ArrowDownToLine size={15} /> Direct device-to-device transfers</span>
    </div>
  </section>
);
