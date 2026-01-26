import { useQuery } from '@tanstack/react-query';
import { getCollection, pb, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Notification, NotificationStats } from '../types';

/**
 * Shared query function for fetching notifications.
 * Used by both useNotifications and useNotificationStats to ensure consistency.
 */
export async function fetchNotifications(): Promise<Notification[]> {
  const userId = pb.authStore.record?.id;
  if (!userId) return [];

  const notifications = await getCollection<Notification>(
    Collections.NOTIFICATIONS
  ).getFullList({
    sort: '-created',
    filter: `user_id="${userId}"`,
  });

  return notifications;
}

/**
 * Hook to fetch notification stats (total, unread, read counts).
 * Derives data from the same query as useNotifications for consistency.
 */
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
