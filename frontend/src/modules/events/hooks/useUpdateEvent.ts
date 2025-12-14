import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Event, EventFormData } from '../types';

interface UpdateEventData {
  id: string;
  data: EventFormData;
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateEventData) => {
      const event = await getCollection<Event>(Collections.EVENTS).update(id, data);
      return event;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('events').list(),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('events').detail(variables.id),
      });
    },
  });
}
