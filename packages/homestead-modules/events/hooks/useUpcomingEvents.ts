/**
 * Upcoming events for any consumer that wants a sorted list of imminent
 * yearly-recurring events (e.g. the dashboard widget). Replaces the
 * legacy `useUpcomingPeople` hook in the people module.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import {
  getNextOccurrence,
  parseDateString,
} from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { EVENTS } from '../resources';
import { PEOPLE } from '../../people/resources';
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
  date: Date;
}

const DEFAULT_LOOKAHEAD_DAYS = 7;

function personIdFromRef(ref: string): string {
  return ref.startsWith('people/') ? ref.slice('people/'.length) : ref;
}

export function useUpcomingEvents(days: number = DEFAULT_LOOKAHEAD_DAYS) {
  return useQuery<UpcomingEvent[]>({
    queryKey: queryKeys
      .module('events')
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
        if (!event.date?.trim()) continue;
        const next = getNextOccurrence(parseDateString(event.date));
        if (next < startOfToday || next > futureDate) continue;
        const names = (event.people ?? [])
          .map((ref) => peopleById.get(personIdFromRef(ref))?.name)
          .filter((n): n is string => !!n);
        upcoming.push({
          id: event.id,
          name: event.name,
          names,
          tag: event.tag,
          date: next,
        });
      }

      return upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
    },
  });
}
