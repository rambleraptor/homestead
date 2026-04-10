/**
 * Notification subscription read hook — branches on the `settings` flag.
 *
 * In aepbase, notification-subscriptions is a child of users
 * (`/users/{id}/notification-subscriptions`). The user only ever has zero or
 * one subscription so we read the first.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { NotificationSubscription } from '../types';

interface AepNotificationSubscription extends NotificationSubscription {
  path: string;
  create_time: string;
  update_time: string;
}

export function useNotificationSubscription() {
  return useQuery({
    queryKey: queryKeys.module('settings').list({ type: 'notification-subscription' }),
    queryFn: async () => {
      try {
        if (isAepbaseEnabled('settings')) {
          const userId = aepbase.getCurrentUser()?.id;
          if (!userId) return null;
          const list = await aepbase.list<AepNotificationSubscription>(
            AepCollections.NOTIFICATION_SUBSCRIPTIONS,
            { parent: [AepCollections.USERS, userId] },
          );
          return list.length > 0 ? list[0] : null;
        }

        const userId = pb.authStore.record?.id;
        if (!userId) return null;
        const subscriptions = await getCollection<NotificationSubscription>(
          Collections.NOTIFICATION_SUBSCRIPTIONS,
        ).getFullList({ filter: `user_id="${userId}"` });
        return subscriptions.length > 0 ? subscriptions[0] : null;
      } catch (error) {
        logger.error('Failed to fetch notification subscription', error);
        return null;
      }
    },
  });
}
