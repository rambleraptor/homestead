import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Event, EventFormData } from '../types';

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EventFormData) => {
      const event = await getCollection<Event>(Collections.EVENTS).create({
        ...data,
        created_by: pb.authStore.record?.id,
      });
      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('events').list(),
      });
    },
  });
}
