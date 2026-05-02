import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
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
        const userId = aepbase.getCurrentUser()?.id;
        if (!userId) return null;
        const list = await aepbase.list<AepNotificationSubscription>(
          AepCollections.NOTIFICATION_SUBSCRIPTIONS,
          { parent: [AepCollections.USERS, userId] },
        );
        return list.length > 0 ? list[0] : null;
      } catch (error) {
        logger.error('Failed to fetch notification subscription', error);
        return null;
      }
    },
  });
}
