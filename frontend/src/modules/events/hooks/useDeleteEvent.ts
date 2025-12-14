import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await getCollection(Collections.EVENTS).delete(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('events').list(),
      });
    },
  });
}
