import { useQuery } from '@tanstack/react-query';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { NotificationSubscription } from '../types';

export function useNotificationSubscription() {
  return useQuery({
    queryKey: queryKeys.module('settings').list({ type: 'notification-subscription' }),
    queryFn: async () => {
      const userId = pb.authStore.record?.id;
      if (!userId) return null;

      try {
        const subscriptions = await getCollection<NotificationSubscription>(
          Collections.NOTIFICATION_SUBSCRIPTIONS
        ).getFullList({
          filter: `user_id="${userId}"`,
        });

        return subscriptions.length > 0 ? subscriptions[0] : null;
      } catch (error) {
        console.error('Failed to fetch notification subscription:', error);
        return null;
      }
    },
  });
}
