import { useQuery } from '@tanstack/react-query';
import { Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import { fetchNotifications } from './useNotificationStats';

/**
 * Hook to fetch all notifications for the current user.
 * Shares the same query as useNotificationStats for consistency.
 */
export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.module(Collections.NOTIFICATIONS).list(),
    queryFn: fetchNotifications,
  });
}
