import { useQuery } from '@tanstack/react-query';
import { getCollection } from '../../../core/api/pocketbase';
import { queryKeys } from '../../../core/api/queryClient';
import type { Event } from '../types';

export function useEventById(id: string) {
  return useQuery({
    queryKey: queryKeys.module('events').detail(id),
    queryFn: async () => {
      const event = await getCollection<Event>('events').getOne(id);
      return event;
    },
    enabled: !!id,
  });
}
