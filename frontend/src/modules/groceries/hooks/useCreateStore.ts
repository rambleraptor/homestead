import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { Store } from '../types';

export function useCreateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; sort_order?: number }) => {
      logger.info(`Creating store: ${data.name}`);
      return await aepbase.create<Store>(AepCollections.STORES, {
        name: data.name,
        sort_order: data.sort_order ?? 0,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('groceries').detail('stores'),
      });
    },
    onError: (error) => logger.error('Failed to create store', error),
  });
}
