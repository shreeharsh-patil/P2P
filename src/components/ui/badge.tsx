import * as React from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]',
        variant === 'default'
          ? 'border-[#ff3a40]/25 bg-[#ff2b2b]/[0.06] text-[#ff777c]'
          : 'border-[#28282d] bg-[#09090b]/85 text-[#9a9a9f]',
        className,
      )}
      {...props}
    />
  );
}
