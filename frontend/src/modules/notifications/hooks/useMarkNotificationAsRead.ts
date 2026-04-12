/**
 * Mark notification as read — branches on the `notifications` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type { Notification } from '../types';

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const body = { read: true, read_at: new Date().toISOString() };
      if (isAepbaseEnabled('notifications')) {
        const userId = aepbase.getCurrentUser()?.id;
        if (!userId) throw new Error('User not authenticated');
        return await aepbase.update<Notification>(
          AepCollections.NOTIFICATIONS,
          id,
          body,
          { parent: [AepCollections.USERS, userId] },
        );
      }
      return await getCollection<Notification>(Collections.NOTIFICATIONS).update(id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module(Collections.NOTIFICATIONS).all(),
      });
    },
  });
}
