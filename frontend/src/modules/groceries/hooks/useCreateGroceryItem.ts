import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { GroceryItem, GroceryItemFormData } from '../types';

export function useCreateGroceryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: GroceryItemFormData) => {
      logger.info(`Creating grocery item: ${data.name}`);
      return await aepbase.create<GroceryItem>(AepCollections.GROCERIES, {
        name: data.name,
        notes: data.notes || '',
        store: data.store || '',
        checked: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => logger.error('Failed to create grocery item', error),
  });
}
