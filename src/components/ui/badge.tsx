import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-white/12 bg-white/[0.06] text-[var(--foreground)]',
        pink: 'border-[#f27494]/30 bg-[#f27494]/12 text-[#f9a8be]',
        coral: 'border-[#f39470]/30 bg-[#f39470]/12 text-[#f9bfa6]',
        aqua: 'border-[#6be0eb]/30 bg-[#6be0eb]/12 text-[#8beaf2]',
        emerald: 'border-emerald-400/30 bg-emerald-500/12 text-emerald-300',
        amber: 'border-amber-400/30 bg-amber-500/12 text-amber-200',
        destructive: 'border-rose-400/30 bg-rose-500/12 text-rose-200',
        muted: 'border-white/8 bg-white/[0.03] text-[var(--muted-foreground)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
