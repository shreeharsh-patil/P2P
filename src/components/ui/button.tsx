import * as React from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variants: Record<ButtonVariant, string> = {
  default:
    'border border-[#ff3a40]/70 bg-[#ff2b2b] text-white shadow-[0_8px_24px_rgba(255,43,43,0.18)] hover:bg-[#e51b23] hover:border-[#ff555b]',
  outline:
    'border border-[#2b2b32] bg-transparent text-[#f2f2f2] hover:border-[#ff3a40]/55 hover:bg-white/[0.035] hover:text-white',
  secondary:
    'border border-[#29292f] bg-[#141416] text-[#e5e5e5] hover:border-[#39393f] hover:bg-[#1a1a1d]',
  ghost:
    'border border-transparent bg-transparent text-[#a0a0a0] hover:bg-white/[0.05] hover:text-white',
};

const sizes: Record<ButtonSize, string> = {
  default: 'h-11 px-4 py-2',
  sm: 'h-9 rounded-md px-3 text-xs',
  lg: 'h-12 rounded-lg px-6',
  icon: 'h-10 w-10 rounded-md',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff3a40]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
