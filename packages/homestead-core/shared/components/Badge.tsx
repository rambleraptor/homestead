import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

/**
 * Badge / semantic pill.
 *
 * Per design system: `rounded-full px-3 py-1 text-xs font-medium` with soft,
 * low-saturation backgrounds. Variants cover the semantic cases called out
 * in the spec (birthday = soft blue, anniversary = soft amber) plus a few
 * general-purpose tones useful for status chips across modules.
 *
 * Use a `Badge` any time you need a small chip describing a row's category
 * or status, rather than hand-rolling rounded spans with ad-hoc colors.
 */
export const badgeVariants = cva(
  'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium font-body',
  {
    variants: {
      variant: {
        neutral: 'bg-gray-100 text-brand-slate',
        birthday: 'bg-blue-50 text-blue-700',
        anniversary: 'bg-orange-50 text-orange-700',
        success: 'bg-green-50 text-green-700',
        warning: 'bg-amber-50 text-amber-700',
        danger: 'bg-red-50 text-red-700',
        info: 'bg-blue-50 text-blue-700',
        accent: 'bg-accent-terracotta/10 text-accent-terracotta',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  children: ReactNode;
}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
