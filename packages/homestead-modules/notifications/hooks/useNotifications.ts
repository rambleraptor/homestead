import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { fetchNotifications } from './useNotificationStats';

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.module('notifications').list(),
    queryFn: fetchNotifications,
  });
}
