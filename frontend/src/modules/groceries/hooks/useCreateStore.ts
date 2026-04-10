/**
 * Create Store Hook — branches on the `groceries` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { Store } from '../types';

export function useCreateStore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; sort_order?: number }) => {
      logger.info(`Creating store: ${data.name}`);
      const body = { name: data.name, sort_order: data.sort_order ?? 0 };
      if (isAepbaseEnabled('groceries')) {
        return await aepbase.create<Store>(AepCollections.STORES, body);
      }
      return await getCollection<Store>(Collections.STORES).create(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('groceries').detail('stores'),
      });
    },
    onError: (error) => {
      logger.error('Failed to create store', error);
    },
  });
}
