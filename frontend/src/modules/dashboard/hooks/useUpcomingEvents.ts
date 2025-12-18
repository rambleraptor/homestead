import { useQuery } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Event } from '@/modules/events/types';

/**
 * Hook to fetch upcoming events (next 30 days)
 */
export function useUpcomingEvents() {
  return useQuery({
    queryKey: queryKeys.module('dashboard').list({ type: 'events-upcoming' }),
    queryFn: async () => {
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      // Format dates as YYYY-MM-DD for PocketBase filter
      const todayStr = today.toISOString().split('T')[0];
      const futureStr = thirtyDaysFromNow.toISOString().split('T')[0];

      const events = await getCollection<Event>(Collections.EVENTS).getFullList({
        filter: `event_date >= "${todayStr}" && event_date <= "${futureStr}"`,
        sort: 'event_date',
        limit: 10,
      });

      return events;
    },
  });
}
