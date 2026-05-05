import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { EVENTS } from '../resources';
import type { Event } from '../types';

export function useEvents() {
  return useQuery({
    queryKey: queryKeys.module('events').resource('event').list(),
    queryFn: async (): Promise<Event[]> => {
      const events = await aepbase.list<Event>(EVENTS);
      return events.sort((a, b) =>
        (a.name || '').localeCompare(b.name || ''),
      );
    },
  });
}
