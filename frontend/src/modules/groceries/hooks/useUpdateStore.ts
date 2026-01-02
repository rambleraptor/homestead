/**
 * Update Store Hook
 *
 * Mutation for updating an existing store
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { Store } from '../types';

export function useUpdateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; data: Partial<Pick<Store, 'name' | 'sort_order'>> }) => {
      logger.info(`Updating store: ${params.id}`);

      const store = await getCollection<Store>(Collections.STORES).update(params.id, params.data);

      return store;
    },
    onSuccess: () => {
      // Invalidate stores list to refresh
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').detail('stores') });
    },
    onError: (error) => {
      logger.error('Failed to update store', error);
    },
  });
}
