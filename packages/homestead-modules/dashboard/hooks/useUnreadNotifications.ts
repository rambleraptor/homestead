import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { Notification } from '../../notifications/types';

interface AepNotification extends Notification {
  path: string;
  create_time: string;
  update_time: string;
}

export function useUnreadNotifications() {
  return useQuery({
    queryKey: queryKeys.module('dashboard').list({ type: 'notifications-unread' }),
    queryFn: async () => {
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) return [];
      const all = await aepbase.list<AepNotification>(AepCollections.NOTIFICATIONS, {
        parent: [AepCollections.USERS, userId],
      });
      return all
        .filter((n) => !n.read)
        .map((rec) => ({
          ...rec,
          created: rec.create_time || '',
          updated: rec.update_time || '',
        }))
        .sort((a, b) => (b.created || '').localeCompare(a.created || ''))
        .slice(0, 10);
    },
  });
}
