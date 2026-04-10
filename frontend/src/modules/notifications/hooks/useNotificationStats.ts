/**
 * Notification stats + shared fetcher — branches on the `notifications` flag.
 *
 * In aepbase, notifications are children of users (`/users/{id}/notifications`)
 * so we no longer filter by `user_id`; the URL implies the scope. The shared
 * `fetchNotifications()` helper is called by both `useNotifications` and
 * `useNotificationStats` so they stay in sync.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type { Notification, NotificationStats } from '../types';

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

export async function fetchNotifications(): Promise<Notification[]> {
  if (isAepbaseEnabled('notifications')) {
    const userId = aepbase.getCurrentUser()?.id;
    if (!userId) return [];
    const list = await aepbase.list<AepNotification>(AepCollections.NOTIFICATIONS, {
      parent: [AepCollections.USERS, userId],
    });
    return list
      .map(normalize)
      .sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  }

  const userId = pb.authStore.record?.id;
  if (!userId) return [];
  return await getCollection<Notification>(Collections.NOTIFICATIONS).getFullList({
    sort: '-created',
    filter: `user_id="${userId}"`,
  });
}

export function useNotificationStats() {
  return useQuery({
    queryKey: queryKeys.module(Collections.NOTIFICATIONS).list(),
    queryFn: fetchNotifications,
    select: (notifications): NotificationStats => ({
      total: notifications.length,
      unread: notifications.filter((n) => !n.read).length,
      read: notifications.filter((n) => n.read).length,
    }),
  });
}
