/**
 * Update notification subscription — branches on the `settings` flag.
 *
 * Both backends use the same upsert pattern: list existing, update if found,
 * create otherwise.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type { NotificationSubscription } from '../types';

interface UpdateSubscriptionData {
  subscription: PushSubscription;
  enabled: boolean;
}

interface AepNotificationSubscription extends NotificationSubscription {
  path: string;
  create_time: string;
  update_time: string;
}

export function useUpdateNotificationSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateSubscriptionData) => {
      if (isAepbaseEnabled('settings')) {
        const userId = aepbase.getCurrentUser()?.id;
        if (!userId) throw new Error('User not authenticated');

        const parent = [AepCollections.USERS, userId];
        const existing = await aepbase.list<AepNotificationSubscription>(
          AepCollections.NOTIFICATION_SUBSCRIPTIONS,
          { parent },
        );

        if (existing.length > 0) {
          return await aepbase.update<AepNotificationSubscription>(
            AepCollections.NOTIFICATION_SUBSCRIPTIONS,
            existing[0].id,
            { subscription_data: data.subscription, enabled: data.enabled },
            { parent },
          );
        }
        return await aepbase.create<AepNotificationSubscription>(
          AepCollections.NOTIFICATION_SUBSCRIPTIONS,
          {
            user_id: userId,
            subscription_data: data.subscription,
            enabled: data.enabled,
          },
          { parent },
        );
      }

      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('User not authenticated');

      const existing = await getCollection<NotificationSubscription>(
        Collections.NOTIFICATION_SUBSCRIPTIONS,
      ).getFullList({ filter: `user_id="${userId}"` });

      if (existing.length > 0) {
        return await getCollection<NotificationSubscription>(
          Collections.NOTIFICATION_SUBSCRIPTIONS,
        ).update(existing[0].id, {
          subscription_data: data.subscription,
          enabled: data.enabled,
        });
      }
      return await getCollection<NotificationSubscription>(
        Collections.NOTIFICATION_SUBSCRIPTIONS,
      ).create({
        user_id: userId,
        subscription_data: data.subscription,
        enabled: data.enabled,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('settings').list({ type: 'notification-subscription' }),
      });
    },
  });
}
