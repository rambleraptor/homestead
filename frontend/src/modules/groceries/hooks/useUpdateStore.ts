import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { Store } from '../types';

export function useUpdateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      id: string;
      data: Partial<Pick<Store, 'name' | 'sort_order'>>;
    }) => {
      logger.info(`Updating store: ${params.id}`);
      return await aepbase.update<Store>(AepCollections.STORES, params.id, params.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('groceries').detail('stores'),
      });
    },
    onError: (error) => logger.error('Failed to update store', error),
  });
}
