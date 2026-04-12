/**
 * Delete notification subscription — branches on the `settings` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type { NotificationSubscription } from '../types';

interface AepNotificationSubscription extends NotificationSubscription {
  path: string;
  create_time: string;
  update_time: string;
}

export function useDeleteNotificationSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (isAepbaseEnabled('settings')) {
        const userId = aepbase.getCurrentUser()?.id;
        if (!userId) throw new Error('User not authenticated');

        const parent = [AepCollections.USERS, userId];
        const existing = await aepbase.list<AepNotificationSubscription>(
          AepCollections.NOTIFICATION_SUBSCRIPTIONS,
          { parent },
        );
        if (existing.length > 0) {
          await aepbase.remove(
            AepCollections.NOTIFICATION_SUBSCRIPTIONS,
            existing[0].id,
            { parent },
          );
        }
        return;
      }

      const userId = pb.authStore.record?.id;
      if (!userId) throw new Error('User not authenticated');

      const existing = await getCollection<NotificationSubscription>(
        Collections.NOTIFICATION_SUBSCRIPTIONS,
      ).getFullList({ filter: `user_id="${userId}"` });

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
