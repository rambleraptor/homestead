import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

/**
 * SectionCard
 *
 * Matches the design system "Information Card" specification: a rounded-2xl
 * surface-white card with a bordered header row containing an icon chip,
 * a display-font title, and an optional right-aligned action (e.g. a
 * "View all" link). Children render in the body.
 *
 * Prefer this component over hand-rolling card headers so every card
 * across modules has identical structure, spacing, and typography.
 *
 * @example
 *   <SectionCard
 *     icon={Users}
 *     title="Upcoming"
 *     action={<Link href="/people">View all</Link>}
 *   >
 *     ...rows...
 *   </SectionCard>
 */
export interface SectionCardProps {
  /** Lucide icon rendered in the header chip. */
  icon?: LucideIcon;
  title: ReactNode;
  /** Right-aligned action slot, e.g. a "View all" link or an actions menu. */
  action?: ReactNode;
  /** Body content. */
  children?: ReactNode;
  /** Additional classes merged into the outer card. */
  className?: string;
  /** Additional classes merged into the body wrapper. */
  bodyClassName?: string;
}

export function SectionCard({
  icon: Icon,
  title,
  action,
  children,
  className,
  bodyClassName,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        'bg-surface-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden',
        className,
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-50">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="bg-gray-50 rounded-lg p-2" aria-hidden="true">
              <Icon className="w-5 h-5 text-brand-navy" />
            </div>
          )}
          <h2 className="font-display font-semibold text-lg text-brand-navy">
            {title}
          </h2>
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      {children !== undefined && (
        <div className={cn('p-4', bodyClassName)}>{children}</div>
      )}
    </section>
  );
}
