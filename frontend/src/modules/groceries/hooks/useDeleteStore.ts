import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';

export function useDeleteStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      logger.info(`Deleting store: ${id}`);
      await aepbase.remove(AepCollections.STORES, id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('groceries').detail('stores'),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => logger.error('Failed to delete store', error),
  });
}
