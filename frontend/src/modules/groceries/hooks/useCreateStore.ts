/**
 * Create Store Hook
 *
 * Mutation for creating a new store
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/core/api/queryClient';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { logger } from '@/core/utils/logger';
import type { Store } from '../types';

export function useCreateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; sort_order?: number }) => {
      logger.info(`Creating store: ${data.name}`);

      const store = await getCollection<Store>(Collections.STORES).create({
        name: data.name,
        sort_order: data.sort_order ?? 0,
      });

      return store;
    },
    onSuccess: () => {
      // Invalidate stores list to refresh
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').detail('stores') });
    },
    onError: (error) => {
      logger.error('Failed to create store', error);
    },
  });
}
