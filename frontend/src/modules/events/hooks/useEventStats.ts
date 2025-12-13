import { useQuery } from '@tanstack/react-query';
import { getCollection } from '../../../core/api/pocketbase';
import { queryKeys } from '../../../core/api/queryClient';
import type { Event, EventStats } from '../types';

export function useEventStats() {
  return useQuery({
    queryKey: queryKeys.module('events').list({ type: 'stats' }),
    queryFn: async () => {
      const events = await getCollection<Event>('events').getFullList();

      const now = new Date();
      const oneMonthFromNow = new Date(now);
      oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

      const upcomingEvents = events.filter((event) => {
        const eventDate = new Date(event.event_date);

        // For recurring yearly events, check if it's upcoming this year
        if (event.recurring_yearly) {
          const thisYearEvent = new Date(
            now.getFullYear(),
            eventDate.getMonth(),
            eventDate.getDate()
          );
          return thisYearEvent >= now && thisYearEvent <= oneMonthFromNow;
        }

        return eventDate >= now && eventDate <= oneMonthFromNow;
      });

      const stats: EventStats = {
        totalEvents: events.length,
        upcomingBirthdays: upcomingEvents.filter(
          (e) => e.event_type === 'birthday'
        ).length,
        upcomingAnniversaries: upcomingEvents.filter(
          (e) => e.event_type === 'anniversary'
        ).length,
      };

      return stats;
    },
  });
}
