/**
 * Upcoming birthdays/anniversaries for any consumer that wants a
 * sorted list of imminent people events (e.g. the dashboard widget).
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { getUpcomingEvents } from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import type { PersonSharedData } from '../types';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
}

export interface UpcomingEvent {
  id: string;
  names: string[];
  type: 'Birthday' | 'Anniversary';
  date: Date;
}

export function useUpcomingPeople() {
  return useQuery<UpcomingEvent[]>({
    queryKey: queryKeys.module('people').list({ type: 'upcoming' }),
    queryFn: async () => {
      const [allPeople, allShared] = await Promise.all([
        aepbase.list<PersonRecord>(AepCollections.PEOPLE),
        aepbase.list<PersonSharedData>(AepCollections.PERSON_SHARED_DATA),
      ]);

      const peopleById = new Map(allPeople.map((p) => [p.id, p]));
      const events: UpcomingEvent[] = [];

      for (const person of allPeople) {
        for (const ev of getUpcomingEvents(person.birthday ?? null, null, 30)) {
          events.push({
            id: `${person.id}-birthday`,
            names: [person.name],
            type: ev.type,
            date: ev.date,
          });
        }
      }

      for (const shared of allShared) {
        if (!shared.anniversary) continue;
        for (const ev of getUpcomingEvents(null, shared.anniversary, 30)) {
          const names = [
            peopleById.get(shared.person_a)?.name,
            shared.person_b ? peopleById.get(shared.person_b)?.name : undefined,
          ].filter((n): n is string => !!n);
          if (names.length === 0) continue;
          events.push({
            id: `${shared.id}-anniversary`,
            names,
            type: ev.type,
            date: ev.date,
          });
        }
      }

      return events.sort((a, b) => a.date.getTime() - b.date.getTime());
    },
  });
}
