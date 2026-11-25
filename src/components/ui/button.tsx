import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] disabled:pointer-events-none disabled:opacity-45 cursor-pointer select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'dusk-gradient-bg text-white shadow-[0_6px_22px_-6px_rgba(220,38,38,0.55),inset_0_1px_0_rgba(255,255,255,0.22)] border border-white/15',
        secondary:
          'bg-white/[0.06] text-[var(--foreground)] hover:bg-white/[0.11] border border-white/[0.10] hover:border-white/[0.18] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        outline:
          'bg-transparent text-[var(--foreground)] border border-white/[0.14] hover:bg-white/[0.06] hover:border-white/[0.24]',
        ghost:
          'bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-white/[0.07]',
        destructive:
          'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25 hover:border-rose-400/45',
        aqua:
          'bg-[#ff7777]/12 text-[#ff8585] border border-[#ff7777]/30 hover:bg-[#ff7777]/20 hover:border-[#ff7777]/45',
        emerald:
          'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-500/25 hover:border-emerald-400/45',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs rounded-md',
        lg: 'h-11 px-6 text-sm rounded-xl',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { buttonVariants };
