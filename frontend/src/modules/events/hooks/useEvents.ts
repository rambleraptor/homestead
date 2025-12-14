import { useQuery } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Event } from '../types';

export function useEvents() {
  return useQuery({
    queryKey: queryKeys.module('events').list(),
    queryFn: async () => {
      const events = await getCollection<Event>(Collections.EVENTS).getFullList({
        sort: 'event_date',
      });
      return events;
    },
  });
}
