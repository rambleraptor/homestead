/**
 * The upcoming-events widget in one line, for the agentic home's strip.
 * Something happening today leads and is urgent ("Sam's birthday today");
 * otherwise the next event within the widget's week ("Next: Sam's birthday
 * in 3 days"); nothing at all when the week is clear.
 */

import type { WidgetSummary } from '@rambleraptor/homestead-core/apps/types';
import { useUpcomingEvents } from './useUpcomingEvents';
import { daysFromToday, eventPhrase, relativeDay } from '../utils/upcoming';

export function summarizeUpcoming(
  upcoming: readonly { name: string; names: string[]; tag?: string; date: Date }[],
  now: Date = new Date(),
): WidgetSummary | null {
  const next = upcoming[0];
  if (!next) return null;
  const days = daysFromToday(next.date, now);
  const phrase = eventPhrase(next);
  if (days <= 0) {
    const others = upcoming.filter((e) => e !== next && daysFromToday(e.date, now) <= 0).length;
    return {
      headline: others > 0 ? `${phrase} today · ${others} more` : `${phrase} today`,
      urgent: true,
    };
  }
  return { headline: `Next: ${phrase} ${relativeDay(days)}` };
}

export default function useUpcomingEventsSummary(): WidgetSummary | null | undefined {
  const { data: upcoming, isLoading } = useUpcomingEvents();
  if (isLoading) return undefined;
  return summarizeUpcoming(upcoming ?? []);
}
