import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, getCurrentUser, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Event, EventFormData } from '../types';

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: EventFormData) => {
      try {
        const currentUser = getCurrentUser();
        const event = await getCollection<Event>(Collections.EVENTS).create({
          ...data,
          created_by: currentUser?.id,
        });
        return event;
      } catch (error) {
        console.error('Failed to create event:', error);
        console.error('Event data:', data);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('events').list(),
      });
    },
    onError: (error) => {
      console.error('Mutation error:', error);
    },
  });
}
