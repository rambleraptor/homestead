import { useQuery } from '@tanstack/react-query';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Notification } from '../types';

/**
 * Hook to fetch unread notifications for the current user
 */
export function useUnreadNotifications() {
  return useQuery({
    queryKey: queryKeys.module('dashboard').list({ type: 'notifications-unread' }),
    queryFn: async () => {
      const notifications = await getCollection<Notification>(Collections.NOTIFICATIONS).getFullList({
        filter: 'read = false',
        sort: '-created',
        limit: 10,
      });
      return notifications;
    },
  });
}
