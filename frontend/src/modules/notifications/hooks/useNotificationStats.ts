import { useQuery } from '@tanstack/react-query';
import { getCollection, pb } from '../../../core/api/pocketbase';
import { queryKeys } from '../../../core/api/queryClient';
import type { Notification, NotificationStats } from '../types';

export function useNotificationStats() {
  return useQuery({
    queryKey: queryKeys.module('notifications').list({ type: 'stats' }),
    queryFn: async () => {
      const userId = pb.authStore.record?.id;
      if (!userId) {
        return { total: 0, unread: 0, read: 0 };
      }

      const notifications = await getCollection<Notification>(
        'notifications'
      ).getFullList({
        filter: `user_id="${userId}"`,
      });

      const stats: NotificationStats = {
        total: notifications.length,
        unread: notifications.filter((n) => !n.read).length,
        read: notifications.filter((n) => n.read).length,
      };

      return stats;
    },
  });
}
