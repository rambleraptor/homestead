import { useQuery } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import { getUpcomingEvents } from '@/shared/utils/dateUtils';
import type { Person } from '@/modules/people/types';

/**
 * Hook to fetch upcoming birthdays and anniversaries (next 30 days)
 *
 * Note: Client-side filtering is required because PocketBase doesn't support
 * date arithmetic for recurring annual dates (e.g., finding birthdays in next 30 days
 * accounting for year rollover). We optimize by only fetching people with dates set.
 */
export function useUpcomingPeople() {
  return useQuery({
    queryKey: queryKeys.module('dashboard').list({ type: 'people-upcoming' }),
    queryFn: async () => {
      // Only fetch people who have a birthday or anniversary set
      const people = await getCollection<Person>(Collections.PEOPLE).getFullList({
        filter: 'birthday != "" || anniversary != ""',
        sort: 'name',
      });

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
