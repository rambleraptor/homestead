/**
 * Dashboard widget showing yearly-recurring events that fall within the
 * next 7 days. Reads from the `events` collection — the sole source of
 * truth for household events. An event falling today wears the Today
 * badge, with the person's age when the event knows it.
 */

import { useNavigate } from 'react-router-dom';
import { CalendarHeart } from 'lucide-react';
import { format } from 'date-fns';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { useUpcomingEvents } from '../hooks/useUpcomingEvents';
import {
  daysFromToday,
  formatPeopleList,
  isPeopleCenteredTag,
  relativeDay,
  todayAgeLabel,
} from '../utils/upcoming';
import { TodayBadge } from './TodayBadge';

function badgeVariantForTag(
  tag?: string,
): 'birthday' | 'anniversary' | 'neutral' {
  if (tag === 'birthday') return 'birthday';
  if (tag === 'anniversary') return 'anniversary';
  return 'neutral';
}

export function UpcomingEventsWidget() {
  const navigate = useNavigate();
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
        <SkeletonList
          rows={3}
          label="Loading upcoming events"
          data-testid="upcoming-events-widget-loading"
        />
      ) : upcoming && upcoming.length > 0 ? (
        <ul className="divide-y divide-gray-50">
          {upcoming.map(({ id, name, names, tag, year, date }) => {
            const daysUntil = daysFromToday(date);
            const today = daysUntil <= 0;
            const relative = capitalize(relativeDay(daysUntil));
            const showPeopleAsTitle =
              isPeopleCenteredTag(tag) && names.length > 0;
            const headerText = showPeopleAsTitle
              ? formatPeopleList(names)
              : name;

            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => navigate('/events')}
                  data-testid={`upcoming-event-${id}`}
                  className="w-full text-left py-4 flex items-start justify-between gap-3 hover:bg-bg-pearl/60 transition-colors rounded-lg px-2 -mx-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-body font-medium text-text-main text-base truncate">
                      {headerText}
                    </p>
                    {!showPeopleAsTitle && names.length > 0 && (
                      <p className="font-body text-sm text-text-muted truncate">
                        {names.join(', ')}
                      </p>
                    )}
                    <p className="font-body text-sm text-text-muted mt-0.5">
                      {format(date, 'MMM dd')} &middot; {relative}
                    </p>
                  </div>
                  {today ? (
                    <TodayBadge
                      tag={tag}
                      ageLabel={todayAgeLabel({ year, tag }, date)}
                      data-testid={`upcoming-event-today-${id}`}
                    />
                  ) : (
                    tag && <Badge variant={badgeVariantForTag(tag)}>{tag}</Badge>
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
