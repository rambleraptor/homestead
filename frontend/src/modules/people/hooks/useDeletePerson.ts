/**
 * Delete Person Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import { deleteRecurringNotificationsForPerson } from '../utils/notificationSync';

export function useDeletePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await deleteRecurringNotificationsForPerson(id);
      } catch (syncError) {
        logger.error('Failed to delete recurring notifications', syncError, { personId: id });
      }
      await aepbase.remove(AepCollections.PEOPLE, id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('people').list() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('recurring_notifications').list(),
      });
    },
  });
}
