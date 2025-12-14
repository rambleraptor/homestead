import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Notification } from '../types';

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const notification = await getCollection<Notification>(
        Collections.NOTIFICATIONS
      ).update(id, {
        read: true,
        read_at: new Date().toISOString(),
      });
      return notification;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module(Collections.NOTIFICATIONS).list(),
      });
    },
  });
}
