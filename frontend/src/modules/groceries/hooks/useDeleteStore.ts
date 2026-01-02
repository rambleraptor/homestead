/**
 * Delete Store Hook
 *
 * Mutation for deleting a store
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';

export function useDeleteStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      logger.info(`Deleting store: ${id}`);

      await getCollection(Collections.STORES).delete(id);

      return id;
    },
    onSuccess: () => {
      // Invalidate both stores and groceries lists to refresh
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').detail('stores') });
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to delete store', error);
    },
  });
}
