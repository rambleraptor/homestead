/**
 * Upcoming birthdays/anniversaries for dashboard — branches on the `people` flag.
 *
 * In aepbase mode we list all people + shared data and filter client-side
 * (datasets are small). PB mode keeps the original filtered queries.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import { getUpcomingEvents } from '@/shared/utils/dateUtils';
import type { Person, PersonSharedData, NotificationPreference } from '@/modules/people/types';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences: NotificationPreference[];
  created_by: string;
  created?: string;
  updated?: string;
  create_time?: string;
  update_time?: string;
}

function normalizePerson(rec: PersonRecord): PersonRecord {
  return {
    ...rec,
    created: rec.created || rec.create_time || '',
    updated: rec.updated || rec.update_time || '',
  };
}

export function useUpcomingPeople() {
  return useQuery({
    queryKey: queryKeys.module('dashboard').list({ type: 'people-upcoming' }),
    queryFn: async () => {
      let peopleWithBirthdays: PersonRecord[];
      let sharedDataWithAnniversaries: PersonSharedData[];

      if (isAepbaseEnabled('people')) {
        const [allPeople, allShared] = await Promise.all([
          aepbase.list<PersonRecord>(AepCollections.PEOPLE),
          aepbase.list<PersonSharedData>(AepCollections.PERSON_SHARED_DATA),
        ]);
        peopleWithBirthdays = allPeople
          .map(normalizePerson)
          .filter((p) => !!p.birthday);
        sharedDataWithAnniversaries = allShared.filter((s) => !!s.anniversary);

        // Pull in any people referenced by anniversaries that don't have a birthday.
        const haveBirthday = new Set(peopleWithBirthdays.map((p) => p.id));
        const additionalIds = new Set<string>();
        for (const s of sharedDataWithAnniversaries) {
          if (s.person_a && !haveBirthday.has(s.person_a)) additionalIds.add(s.person_a);
          if (s.person_b && !haveBirthday.has(s.person_b)) additionalIds.add(s.person_b);
        }
        for (const p of allPeople) {
          if (additionalIds.has(p.id)) {
            peopleWithBirthdays.push(normalizePerson(p));
          }
        }
      } else {
        [peopleWithBirthdays, sharedDataWithAnniversaries] = await Promise.all([
          getCollection<PersonRecord>(Collections.PEOPLE).getFullList({
            filter: 'birthday != ""',
            sort: 'name',
          }),
          getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA).getFullList({
            filter: 'anniversary != ""',
          }),
        ]);

        const personIdsWithAnniversaries = new Set<string>();
        for (const sharedData of sharedDataWithAnniversaries) {
          personIdsWithAnniversaries.add(sharedData.person_a);
          if (sharedData.person_b) personIdsWithAnniversaries.add(sharedData.person_b);
        }
        const peopleRecordsToFetch = Array.from(personIdsWithAnniversaries).filter(
          (id) => !peopleWithBirthdays.find((p) => p.id === id),
        );
        if (peopleRecordsToFetch.length > 0) {
          const filter = peopleRecordsToFetch.map((id) => `id = "${id}"`).join(' || ');
          const additional = await getCollection<PersonRecord>(Collections.PEOPLE).getFullList({
            filter,
          });
          peopleWithBirthdays = [...peopleWithBirthdays, ...additional];
        }
      }

      const sharedDataMap = new Map<string, PersonSharedData>();
      for (const sharedData of sharedDataWithAnniversaries) {
        sharedDataMap.set(sharedData.person_a, sharedData);
        if (sharedData.person_b) sharedDataMap.set(sharedData.person_b, sharedData);
      }

      const people: Person[] = peopleWithBirthdays.map((record) => ({
        ...record,
        created: record.created || '',
        updated: record.updated || '',
        addresses: [],
        anniversary: sharedDataMap.get(record.id)?.anniversary,
      }));

      const upcoming = people
        .map((person) => {
          const upcomingEvents = getUpcomingEvents(
            person.birthday ?? null,
            person.anniversary ?? null,
            30,
          );
          return upcomingEvents.map((event) => ({
            person,
            type: event.type,
            date: event.date,
          }));
        })
        .flat();

      return upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
    },
  });
}
