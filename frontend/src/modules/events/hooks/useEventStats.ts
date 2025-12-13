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

        // For recurring yearly events, check if it's upcoming this year or next year
        if (event.recurring_yearly) {
          let nextOccurrence = new Date(
            now.getFullYear(),
            eventDate.getMonth(),
            eventDate.getDate()
          );

          // If the event has already passed this year, use next year's date
          if (nextOccurrence < now) {
            nextOccurrence = new Date(
              now.getFullYear() + 1,
              eventDate.getMonth(),
              eventDate.getDate()
            );
          }

          return nextOccurrence >= now && nextOccurrence <= oneMonthFromNow;
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
