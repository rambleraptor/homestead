/**
 * Upcoming events for any consumer that wants a sorted list of imminent
 * yearly-recurring events (e.g. the dashboard widget). Replaces the
 * legacy `useUpcomingPeople` hook in the people app.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { EVENTS } from '../resources';
import { PEOPLE } from '../../people/resources';
import { hasEventDate, nextOccurrence } from '../utils/eventDate';
import type { Event } from '../types';

interface PersonRecord {
  id: string;
  name: string;
}

export interface UpcomingEvent {
  id: string;
  name: string;
  names: string[];
  tag?: string;
  /** Origin year (birth / wedding), when the event knows it — for an age. */
  year?: number;
  date: Date;
}

const DEFAULT_LOOKAHEAD_DAYS = 7;

function personIdFromRef(ref: string): string {
  return ref.startsWith('people/') ? ref.slice('people/'.length) : ref;
}

export function useUpcomingEvents(days: number = DEFAULT_LOOKAHEAD_DAYS) {
  return useQuery<UpcomingEvent[]>({
    queryKey: queryKeys
      .app('events')
      .list({ type: 'upcoming', days }),
    queryFn: async () => {
      const [events, people] = await Promise.all([
        aepbase.list<Event>(EVENTS),
        aepbase.list<PersonRecord>(PEOPLE),
      ]);
      const peopleById = new Map(people.map((p) => [p.id, p]));

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const futureDate = new Date(startOfToday);
      futureDate.setDate(startOfToday.getDate() + days);

      const upcoming: UpcomingEvent[] = [];
      for (const event of events) {
        if (!hasEventDate(event)) continue;
        const next = nextOccurrence(event);
        if (next < startOfToday || next > futureDate) continue;
        const names = (event.people ?? [])
          .map((ref) => peopleById.get(personIdFromRef(ref))?.name)
          .filter((n): n is string => !!n);
        upcoming.push({
          id: event.id,
          name: event.name,
          names,
          tag: event.tag,
          year: event.year,
          date: next,
        });
      }

      return upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
    },
    // The persisted query cache serializes Date to string via JSON. Re-hydrate
    // so consumers can always call .getTime() without guarding.
    select: (data) =>
      data.map((event) => ({
        ...event,
        date: event.date instanceof Date ? event.date : new Date(event.date as unknown as string),
      })),
  });
}
