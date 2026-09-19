import { useQuery } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { USERS } from '@rambleraptor/homestead-core/resources/builtins';
import { NOTIFICATION_SUBSCRIPTIONS } from '@rambleraptor/homestead-core/notifications/constants';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { NotificationSubscription } from '../types';

export interface AepNotificationSubscription extends NotificationSubscription {
  path: string;
  create_time: string;
  update_time: string;
}

/** Shared cache key so the update/delete mutations can invalidate this list. */
export const notificationSubscriptionsKey = queryKeys
  .app('settings')
  .list({ type: 'notification-subscription' });

/**
 * All of the current user's registered push subscriptions — one per device.
 * The settings screen lists these so a user can send a targeted test to, or
 * deregister, an individual device.
 */
export function useNotificationSubscriptions() {
  return useQuery({
    queryKey: notificationSubscriptionsKey,
    // A failed fetch is left to reject so the query reports it and the settings
    // card can say so — swallowing it into an empty list read as "no devices",
    // which is a different (and wrong) answer.
    queryFn: async (): Promise<AepNotificationSubscription[]> => {
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) return [];
      return aepbase.list<AepNotificationSubscription>(NOTIFICATION_SUBSCRIPTIONS, {
        parent: [USERS, userId],
      });
    },
  });
}
