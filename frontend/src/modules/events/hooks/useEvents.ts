import { useQuery } from '@tanstack/react-query';
import { getCollection } from '../../../core/api/pocketbase';
import { queryKeys } from '../../../core/api/queryClient';
import type { Event } from '../types';

export function useEvents() {
  return useQuery({
    queryKey: queryKeys.module('events').list(),
    queryFn: async () => {
      const events = await getCollection<Event>('events').getFullList({
        sort: 'event_date',
      });
      return events;
    },
  });
}
