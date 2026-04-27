/**
 * Delete Person Mutation Hook.
 */

import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { useAepRemove } from '@/core/api/resourceHooks';
import { logger } from '@/core/utils/logger';
import { deleteRecurringNotificationsForPerson } from '../utils/notificationSync';

export function useDeletePerson() {
  return useAepRemove<string>(AepCollections.PEOPLE, {
    moduleId: 'people',
    invalidateAlso: [queryKeys.module('recurring_notifications').list()],
    mutationFn: async (id) => {
      try {
        await deleteRecurringNotificationsForPerson(id);
      } catch (syncError) {
        logger.error('Failed to delete recurring notifications', syncError, {
          personId: id,
        });
      }
      await aepbase.remove(AepCollections.PEOPLE, id);
    },
  });
}
