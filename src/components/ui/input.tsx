import * as React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-11 w-full rounded-md border border-[#29292f] bg-[#080809] px-3 py-2 text-sm text-[#f2f2f2] shadow-sm outline-none transition-colors placeholder:text-[#626267] focus-visible:border-[#ff3a40]/70 focus-visible:ring-2 focus-visible:ring-[#ff3a40]/25 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
