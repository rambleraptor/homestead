/**
 * Upcoming birthdays/anniversaries for dashboard.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { getUpcomingEvents } from '@/shared/utils/dateUtils';
import type { Person, PersonSharedData, NotificationPreference } from '@/modules/people/types';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences?: NotificationPreference[];
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

function normalize(rec: PersonRecord) {
  return {
    ...rec,
    notification_preferences: rec.notification_preferences || [],
    created_by: rec.created_by || '',
    created: rec.create_time || '',
    updated: rec.update_time || '',
  };
}

export function useUpcomingPeople() {
  return useQuery({
    queryKey: queryKeys.module('dashboard').list({ type: 'people-upcoming' }),
    queryFn: async () => {
      const [allPeople, allShared] = await Promise.all([
        aepbase.list<PersonRecord>(AepCollections.PEOPLE),
        aepbase.list<PersonSharedData>(AepCollections.PERSON_SHARED_DATA),
      ]);

      const peopleWithBirthdays = allPeople.filter((p) => !!p.birthday).map(normalize);
      const sharedDataWithAnniversaries = allShared.filter((s) => !!s.anniversary);

      const haveBirthday = new Set(peopleWithBirthdays.map((p) => p.id));
      const additionalIds = new Set<string>();
      for (const s of sharedDataWithAnniversaries) {
        if (s.person_a && !haveBirthday.has(s.person_a)) additionalIds.add(s.person_a);
        if (s.person_b && !haveBirthday.has(s.person_b)) additionalIds.add(s.person_b);
      }
      for (const p of allPeople) {
        if (additionalIds.has(p.id)) peopleWithBirthdays.push(normalize(p));
      }

      const sharedDataMap = new Map<string, PersonSharedData>();
      for (const s of sharedDataWithAnniversaries) {
        sharedDataMap.set(s.person_a, s);
        if (s.person_b) sharedDataMap.set(s.person_b, s);
      }

      const people: Person[] = peopleWithBirthdays.map((record) => ({
        ...record,
        addresses: [],
        anniversary: sharedDataMap.get(record.id)?.anniversary,
      }));

      const upcoming = people
        .map((person) => {
          const events = getUpcomingEvents(person.birthday ?? null, person.anniversary ?? null, 30);
          return events.map((event) => ({ person, type: event.type, date: event.date }));
        })
        .flat();

      return upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
    },
  });
}
