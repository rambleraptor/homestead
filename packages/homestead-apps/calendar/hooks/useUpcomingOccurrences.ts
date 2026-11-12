/**
 * What's coming up on the calendar from now: today's events that haven't
 * finished, and the following `days` days. Shared by the dashboard widget, its
 * one-line summary, and the Today card, so all three agree.
 */

import { useMemo, useState } from 'react';
import type { Calendar, Occurrence } from '../types';
import { addDays, todayDay } from '../utils/dates';
import { expandEvents } from '../utils/occurrences';
import { useCalendarEvents } from './useCalendarEvents';
import { useCalendars } from './useCalendars';

export interface UpcomingOccurrences {
  occurrences: Occurrence[];
  calendars: Calendar[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/** Occurrences from `now` through `days` days ahead, dropping those already over. */
export function upcomingFrom(
  occurrences: readonly Occurrence[],
  now: Date,
): Occurrence[] {
  return occurrences.filter((o) => o.end.getTime() > now.getTime());
}

export function useUpcomingOccurrences(days: number): UpcomingOccurrences {
  // Captured once per mount: a fresh `new Date()` every render would refilter
  // continuously. A tab left open keeps its view until it remounts.
  const [now] = useState(() => new Date());
  const calendarsQuery = useCalendars();
  const eventsQuery = useCalendarEvents();

  const occurrences = useMemo(() => {
    const known = new Set((calendarsQuery.data ?? []).map((c) => c.id));
    const today = todayDay(now);
    const events = (eventsQuery.data ?? []).filter((e) => known.has(e.calendar));
    return upcomingFrom(expandEvents(events, today, addDays(today, days)), now);
  }, [calendarsQuery.data, eventsQuery.data, days, now]);

  return {
    occurrences,
    calendars: calendarsQuery.data ?? [],
    isLoading: calendarsQuery.isLoading || eventsQuery.isLoading,
    error: calendarsQuery.error ?? eventsQuery.error,
    refetch: () => {
      void calendarsQuery.refetch();
      void eventsQuery.refetch();
    },
  };
}
