import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import type { NotificationSubscription } from '../types';

interface AepNotificationSubscription extends NotificationSubscription {
  path: string;
  create_time: string;
  update_time: string;
}

export function useDeleteNotificationSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) throw new Error('User not authenticated');
      const parent = [AepCollections.USERS, userId];
      const existing = await aepbase.list<AepNotificationSubscription>(
        AepCollections.NOTIFICATION_SUBSCRIPTIONS,
        { parent },
      );
      if (existing.length > 0) {
        await aepbase.remove(
          AepCollections.NOTIFICATION_SUBSCRIPTIONS,
          existing[0].id,
          { parent },
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('settings').list({ type: 'notification-subscription' }),
      });
    },
  });
}
