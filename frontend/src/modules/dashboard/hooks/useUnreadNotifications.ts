/**
 * Unread notifications for dashboard — branches on the `notifications` flag.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type { Notification } from '@/modules/notifications/types';

interface AepNotification extends Notification {
  path: string;
  create_time: string;
  update_time: string;
}

function normalize(rec: AepNotification | Notification): Notification {
  const ae = rec as AepNotification;
  return {
    ...rec,
    created: ae.create_time || rec.created || '',
    updated: ae.update_time || rec.updated || '',
  };
}

export function useUnreadNotifications() {
  return useQuery({
    queryKey: queryKeys.module('dashboard').list({ type: 'notifications-unread' }),
    queryFn: async () => {
      if (isAepbaseEnabled('notifications')) {
        const userId = aepbase.getCurrentUser()?.id;
        if (!userId) return [];
        const all = await aepbase.list<AepNotification>(AepCollections.NOTIFICATIONS, {
          parent: [AepCollections.USERS, userId],
        });
        return all
          .filter((n) => !n.read)
          .map(normalize)
          .sort((a, b) => (b.created || '').localeCompare(a.created || ''))
          .slice(0, 10);
      }
      return await getCollection<Notification>(Collections.NOTIFICATIONS).getFullList({
        filter: 'read = false',
        sort: '-created',
        limit: 10,
      });
    },
  });
}
