/**
 * Delete Person Mutation Hook — branches on the `people` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
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

      if (isAepbaseEnabled('people')) {
        await aepbase.remove(AepCollections.PEOPLE, id);
      } else {
        await getCollection(Collections.PEOPLE).delete(id);
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('people').list() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.module(Collections.RECURRING_NOTIFICATIONS).list(),
      });
    },
  });
}
