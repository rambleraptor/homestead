import { useQuery } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import { getUpcomingEvents } from '@/shared/utils/dateUtils';
import type { Person, PersonSharedData, NotificationPreference } from '@/modules/people/types';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences: NotificationPreference[];
  created_by: string;
  created: string;
  updated: string;
}

/**
 * Hook to fetch upcoming birthdays and anniversaries (next 30 days)
 *
 * Note: Client-side filtering is required because PocketBase doesn't support
 * date arithmetic for recurring annual dates (e.g., finding birthdays in next 30 days
 * accounting for year rollover). We optimize by only fetching people/shared data with dates set.
 */
export function useUpcomingPeople() {
  return useQuery({
    queryKey: queryKeys.module('dashboard').list({ type: 'people-upcoming' }),
    queryFn: async () => {
      // Fetch people with birthdays and shared data with anniversaries in parallel
      const [peopleWithBirthdays, sharedDataWithAnniversaries] = await Promise.all([
        getCollection<PersonRecord>(Collections.PEOPLE).getFullList({
          filter: 'birthday != ""',
          sort: 'name',
        }),
        getCollection<PersonSharedData>(Collections.PERSON_SHARED_DATA).getFullList({
          filter: 'anniversary != ""',
        }),
      ]);

      // Create a map of person IDs to their shared data
      const sharedDataMap = new Map<string, PersonSharedData>();
      for (const sharedData of sharedDataWithAnniversaries) {
        sharedDataMap.set(sharedData.person_a, sharedData);
        if (sharedData.person_b) {
          sharedDataMap.set(sharedData.person_b, sharedData);
        }
      }

      // Get unique person IDs from shared data
      const personIdsWithAnniversaries = new Set<string>();
      for (const sharedData of sharedDataWithAnniversaries) {
        personIdsWithAnniversaries.add(sharedData.person_a);
        if (sharedData.person_b) {
          personIdsWithAnniversaries.add(sharedData.person_b);
        }
      }

      // Fetch person records for anniversaries (if they don't already have birthdays)
      const peopleRecordsToFetch = Array.from(personIdsWithAnniversaries).filter(
        id => !peopleWithBirthdays.find(p => p.id === id)
      );

      let additionalPeople: PersonRecord[] = [];
      if (peopleRecordsToFetch.length > 0) {
        const filter = peopleRecordsToFetch.map(id => `id = "${id}"`).join(' || ');
        additionalPeople = await getCollection<PersonRecord>(Collections.PEOPLE).getFullList({
          filter,
        });
      }

      // Combine all people records
      const allPeopleRecords = [...peopleWithBirthdays, ...additionalPeople];

      // Enrich with anniversary data and calculate upcoming events
      const people: Person[] = allPeopleRecords.map(record => ({
        ...record,
        addresses: [], // Addresses not needed for upcoming events view
        anniversary: sharedDataMap.get(record.id)?.anniversary,
      }));

      const upcoming = people
        .map(person => {
          const upcomingEvents = getUpcomingEvents(
            person.birthday ?? null,
            person.anniversary ?? null,
            30
          );
          return upcomingEvents.map(event => ({
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
