import type { ReactNode } from 'react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

/**
 * PageHeader
 *
 * Standard page title for any top-level module screen. Encodes the Homestead
 * design system typography rules:
 *   - Page Title: text-3xl font-display font-bold text-brand-navy tracking-tight
 *   - Subtitle:   text-base font-body text-text-muted mt-1
 *
 * Use this at the top of every module home / detail page so future pages
 * get the correct typography by default. Optional `actions` slot is rendered
 * at the right and wraps beneath the title on narrow viewports.
 *
 * @example
 *   <PageHeader
 *     title="Gift Cards"
 *     subtitle="Manage your household gift cards"
 *     actions={<Button>Add Gift Card</Button>}
 *   />
 */
export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-navy tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-base font-body text-text-muted mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
