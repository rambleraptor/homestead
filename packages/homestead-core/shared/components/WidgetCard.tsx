'use client';

import { useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

/**
 * WidgetCard
 *
 * Base layout for dashboard widgets. Mirrors the Information Card design
 * (rounded-2xl, surface-white, bordered header) but with two widget-specific
 * affordances:
 *   1. The title is a link to the owning module's home route (`href`).
 *   2. A collapse toggle in the header hides the body so only the title row
 *      remains visible.
 *
 * @example
 *   <WidgetCard icon={ShoppingCart} title="Groceries" href="/groceries">
 *     ...content...
 *   </WidgetCard>
 */
export interface WidgetCardProps {
  /** Lucide icon rendered in the header chip. */
  icon?: LucideIcon;
  /** Widget title; rendered inside the link to the module home. */
  title: ReactNode;
  /** Module home route the title links to. */
  href: string;
  /** Body content. Hidden when the widget is collapsed. */
  children?: ReactNode;
  /** Start in the collapsed state. Defaults to false. */
  defaultCollapsed?: boolean;
  /** Additional classes merged into the outer card. */
  className?: string;
  /** Additional classes merged into the body wrapper. */
  bodyClassName?: string;
  /** Optional test id for the outer card. */
  'data-testid'?: string;
}

export function WidgetCard({
  icon: Icon,
  title,
  href,
  children,
  defaultCollapsed = false,
  className,
  bodyClassName,
  'data-testid': testId,
}: WidgetCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const bodyId = useId();
  const ChevronIcon = collapsed ? ChevronDown : ChevronUp;

  return (
    <section
      className={cn(
        'bg-surface-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden',
        className,
      )}
      data-testid={testId}
    >
      <div
        className={cn(
          'flex items-center justify-between p-4',
          !collapsed && 'border-b border-gray-50',
        )}
      >
        <Link
          href={href}
          className="flex items-center gap-3 min-w-0 group rounded-lg -m-1 p-1 hover:bg-bg-pearl/60 transition-colors"
        >
          {Icon && (
            <div className="bg-gray-50 rounded-lg p-2" aria-hidden="true">
              <Icon className="w-5 h-5 text-brand-navy" />
            </div>
          )}
          <h2 className="font-display font-semibold text-lg text-brand-navy truncate group-hover:text-accent-terracotta transition-colors">
            {title}
          </h2>
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          aria-label={collapsed ? 'Expand widget' : 'Collapse widget'}
          className="ml-2 p-1.5 rounded-lg text-text-muted hover:text-brand-navy hover:bg-bg-pearl/60 transition-colors"
          data-testid="widget-collapse-toggle"
        >
          <ChevronIcon className="w-5 h-5" />
        </button>
      </div>
      {children !== undefined && !collapsed && (
        <div id={bodyId} className={cn('p-4', bodyClassName)}>
          {children}
        </div>
      )}
    </section>
  );
}
