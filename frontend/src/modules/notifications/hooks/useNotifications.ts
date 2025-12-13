import { useQuery } from '@tanstack/react-query';
import { getCollection, pb } from '../../../core/api/pocketbase';
import { queryKeys } from '../../../core/api/queryClient';
import type { Notification } from '../types';

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.module('notifications').list(),
    queryFn: async () => {
      const userId = pb.authStore.record?.id;
      if (!userId) return [];

      const notifications = await getCollection<Notification>(
        'notifications'
      ).getFullList({
        sort: '-created',
        filter: `user_id="${userId}"`,
      });

      return notifications;
    },
  });
}
