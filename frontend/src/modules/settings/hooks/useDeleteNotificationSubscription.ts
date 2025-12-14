import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { NotificationSubscription } from '../types';

export function useDeleteNotificationSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('User not authenticated');

      const existing = await getCollection<NotificationSubscription>(
        Collections.NOTIFICATION_SUBSCRIPTIONS
      ).getFullList({
        filter: `user_id="${userId}"`,
      });

      if (existing.length > 0) {
        await getCollection(Collections.NOTIFICATION_SUBSCRIPTIONS).delete(existing[0].id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('settings').list({ type: 'notification-subscription' }),
      });
    },
  });
}
