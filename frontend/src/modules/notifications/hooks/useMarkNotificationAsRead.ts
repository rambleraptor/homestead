/**
 * Mark notification as read.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import type { Notification } from '../types';

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const userId = aepbase.getCurrentUser()?.id;
      if (!userId) throw new Error('User not authenticated');
      return await aepbase.update<Notification>(
        AepCollections.NOTIFICATIONS,
        id,
        { read: true, read_at: new Date().toISOString() },
        { parent: [AepCollections.USERS, userId] },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('notifications').all() });
    },
  });
}
