'use client';

/**
 * Dashboard widget showing yearly-recurring events that fall within the
 * next 7 days. Reads from the `events` collection (the source of truth);
 * the people module's birthday/anniversary fields are dual-written into
 * events on person create/update.
 */

import { useRouter } from 'next/navigation';
import { CalendarHeart, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { useUpcomingEvents } from '../hooks/useUpcomingEvents';

function badgeVariantForTag(
  tag?: string,
): 'birthday' | 'anniversary' | 'neutral' {
  if (tag === 'birthday') return 'birthday';
  if (tag === 'anniversary') return 'anniversary';
  return 'neutral';
}

export function UpcomingEventsWidget() {
  const router = useRouter();
  const { data: upcoming, isLoading } = useUpcomingEvents();

  return (
    <WidgetCard
      icon={CalendarHeart}
      title="Upcoming"
      href="/events"
      bodyClassName="px-4 py-0"
      data-testid="upcoming-events-widget"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
        </div>
      ) : upcoming && upcoming.length > 0 ? (
        <ul className="divide-y divide-gray-50">
          {upcoming.map(({ id, name, names, tag, date }) => {
            const daysUntil = Math.ceil(
              (date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
            );
            const relative =
              daysUntil <= 0
                ? 'Today'
                : daysUntil === 1
                  ? 'Tomorrow'
                  : `in ${daysUntil} days`;

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => router.push('/events')}
                  className="w-full text-left py-4 flex items-start justify-between gap-3 hover:bg-bg-pearl/60 transition-colors rounded-lg px-2 -mx-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-body font-medium text-text-main text-base truncate">
                      {name}
                    </p>
                    {names.length > 0 && (
                      <p className="font-body text-sm text-text-muted truncate">
                        {names.join(', ')}
                      </p>
                    )}
                    <p className="font-body text-sm text-text-muted mt-0.5">
                      {format(date, 'MMM dd')} &middot; {relative}
                    </p>
                  </div>
                  {tag && (
                    <Badge variant={badgeVariantForTag(tag)}>{tag}</Badge>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="text-center py-10">
          <CalendarHeart
            className="w-12 h-12 text-gray-300 mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="font-body text-text-muted">
            No upcoming events in the next 7 days
          </p>
        </div>
      )}
    </WidgetCard>
  );
}
