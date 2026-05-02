'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  testId?: string;
  defaultOpen?: boolean;
  count?: number;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  testId,
  defaultOpen = true,
  count,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={testId ? `${testId}-toggle` : undefined}
        className="flex items-center gap-2 text-brand-navy font-display font-semibold text-lg hover:text-accent-terracotta transition-colors"
      >
        <Chevron className="w-5 h-5" />
        <span>{title}</span>
        {typeof count === 'number' && count > 0 && (
          <span className="text-sm font-body font-medium text-text-muted">
            ({count})
          </span>
        )}
      </button>
      <div className={cn('mt-3 space-y-2', !open && 'hidden')}>{children}</div>
    </section>
  );
}
