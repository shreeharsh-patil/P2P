import React from 'react';

export type StatusKind =
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'transferring'
  | 'paused'
  | 'verifying'
  | 'incoming'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'online'
  | 'offline';

interface StatusIndicatorProps {
  status: StatusKind;
  size?: 'sm' | 'md';
  /** Optional custom label override */
  label?: string;
}

const STATUS_META: Record<StatusKind, { glyph: string; color: string; label: string; pulse?: boolean }> = {
  waiting: { glyph: '●', color: '#8a8a8a', label: 'WAITING' },
  connecting: { glyph: '◌', color: '#ff2b2b', label: 'CONNECTING', pulse: true },
  connected: { glyph: '●', color: '#ff2b2b', label: 'CONNECTED', pulse: true },
  transferring: { glyph: '●', color: '#ff2b2b', label: 'TRANSFERRING', pulse: true },
  paused: { glyph: '⏸', color: '#f2b84b', label: 'PAUSED' },
  verifying: { glyph: '◌', color: '#f2b84b', label: 'VERIFYING' },
  incoming: { glyph: '◌', color: '#f2b84b', label: 'INCOMING OFFER' },
  completed: { glyph: '✓', color: '#34d399', label: 'COMPLETE' },
  failed: { glyph: '×', color: '#fb7185', label: 'FAILED' },
  cancelled: { glyph: '×', color: '#8a8a8a', label: 'CANCELLED' },
  online: { glyph: '●', color: '#34d399', label: 'ONLINE' },
  offline: { glyph: '○', color: '#4a4a4a', label: 'OFFLINE' }
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, size = 'sm', label }) => {
  const meta = STATUS_META[status];
  const textSize = size === 'md' ? 'text-sm' : 'text-[11px]';

  return (
    <span
      className={`inline-flex items-center gap-2 font-mono font-bold tracking-[0.18em] uppercase ${textSize} text-[#f2f2f2]`}
    >
      <span
        className={meta.pulse ? 'animate-pulse' : ''}
        style={{ color: meta.color, textShadow: `0 0 8px ${meta.color}66` }}
      >
        {meta.glyph}
      </span>
      {label || meta.label}
    </span>
  );
};
