import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { NotificationSubscription } from '../types';

interface UpdateSubscriptionData {
  subscription: PushSubscription;
  enabled: boolean;
}

export function useUpdateNotificationSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateSubscriptionData) => {
      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('User not authenticated');

      // Check if subscription already exists
      const existing = await getCollection<NotificationSubscription>(
        Collections.NOTIFICATION_SUBSCRIPTIONS
      ).getFullList({
        filter: `user_id="${userId}"`,
      });

      if (existing.length > 0) {
        // Update existing subscription
        return await getCollection<NotificationSubscription>(
          Collections.NOTIFICATION_SUBSCRIPTIONS
        ).update(existing[0].id, {
          subscription_data: data.subscription,
          enabled: data.enabled,
        });
      } else {
        // Create new subscription
        return await getCollection<NotificationSubscription>(
          Collections.NOTIFICATION_SUBSCRIPTIONS
        ).create({
          user_id: userId,
          subscription_data: data.subscription,
          enabled: data.enabled,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('settings').list({ type: 'notification-subscription' }),
      });
    },
  });
}
