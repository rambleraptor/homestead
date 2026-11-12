/**
 * Dashboard widget: what's on the calendar from now through the coming week,
 * each line in its calendar's colour.
 */

import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { colorClasses } from '../colors';
import { WIDGET_DAYS } from '../hooks/useCalendarSummary';
import { useUpcomingOccurrences } from '../hooks/useUpcomingOccurrences';
import type { Occurrence } from '../types';
import { daysBetween, parseDay, todayDay } from '../utils/dates';
import { formatTime } from '../utils/occurrences';

/** How many lines the card shows before it stops. */
const MAX_ROWS = 6;

function dayLabel(occurrence: Occurrence, today: string): string {
  // Something that began earlier and is still running is, to the reader, today's.
  const days = Math.max(0, daysBetween(today, occurrence.startDay));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return parseDay(occurrence.startDay).toLocaleDateString(undefined, { weekday: 'long' });
}

export function UpcomingWidget() {
  const navigate = useNavigate();
  const { occurrences, calendars, isLoading, error, refetch } =
    useUpcomingOccurrences(WIDGET_DAYS);
  const today = todayDay();
  const shown = occurrences.slice(0, MAX_ROWS);
  const more = occurrences.length - shown.length;

  return (
    <WidgetCard
      icon={CalendarDays}
      title="This week"
      href="/calendar"
      bodyClassName="px-4 py-0"
      data-testid="calendar-widget"
    >
      {isLoading ? (
        <SkeletonList rows={3} label="Loading the calendar" data-testid="calendar-widget-loading" />
      ) : error ? (
        <QueryError
          error={error}
          onRetry={refetch}
          title="Couldn’t load the calendar"
          compact
          className="my-3"
          data-testid="calendar-widget-error"
        />
      ) : shown.length > 0 ? (
        <ul className="divide-y divide-gray-50">
          {shown.map((occurrence) => {
            const color = calendars.find((c) => c.id === occurrence.event.calendar)?.color;
            return (
              <li key={occurrence.key}>
                <button
                  type="button"
                  onClick={() => navigate('/calendar')}
                  className="-mx-2 flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-bg-pearl/60"
                  data-testid="calendar-widget-item"
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorClasses(color).dot}`}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-body text-base font-medium text-text-main">
                      {occurrence.event.title}
                    </span>
                    <span className="block font-body text-sm text-text-muted">
                      {dayLabel(occurrence, today)}
                      {occurrence.allDay ? '' : ` · ${formatTime(occurrence.start)}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {more > 0 && (
            <li className="py-2 text-sm text-text-muted" data-testid="calendar-widget-more">
              +{more} more this week
            </li>
          )}
        </ul>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title="Nothing on the calendar this week"
          description="Appointments, practices and plans show up here as they come round."
          action={{ label: 'Open the calendar', onClick: () => navigate('/calendar') }}
          assistantPrompt="Add a dentist appointment on Thursday at 9am"
          compact
          className="my-3"
          data-testid="calendar-widget-empty"
        />
      )}
    </WidgetCard>
  );
}
