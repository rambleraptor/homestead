/**
 * The calendar widget in one line, for the agentic home's strip. Something on
 * today leads and is urgent ("Dentist at 9:00 AM · 2 more today"); otherwise
 * the next thing this week ("Next: Soccer practice tomorrow"); nothing at all
 * when the week is clear.
 */

import type { WidgetSummary } from '@rambleraptor/homestead-core/apps/types';
import type { Occurrence } from '../types';
import { daysBetween, todayDay } from '../utils/dates';
import { formatTime, relativeDayName } from '../utils/occurrences';
import { useUpcomingOccurrences } from './useUpcomingOccurrences';

export const WIDGET_DAYS = 7;

export function summarizeCalendar(
  upcoming: readonly Occurrence[],
  now: Date = new Date(),
): WidgetSummary | null {
  const today = todayDay(now);
  const todays = upcoming.filter((o) => o.startDay <= today);
  const next = todays[0] ?? upcoming[0];
  if (!next) return null;
  if (todays.length > 0) {
    const what = next.allDay
      ? `${next.event.title} today`
      : `${next.event.title} at ${formatTime(next.start)}`;
    const others = todays.length - 1;
    return { headline: others > 0 ? `${what} · ${others} more today` : what, urgent: true };
  }
  return {
    headline: `Next: ${next.event.title} ${relativeDayName(daysBetween(today, next.startDay), next.start)}`,
  };
}

export default function useCalendarSummary(): WidgetSummary | null | undefined {
  const { occurrences, isLoading } = useUpcomingOccurrences(WIDGET_DAYS);
  if (isLoading) return undefined;
  return summarizeCalendar(occurrences);
}
