/**
 * Create Grocery Item Hook — branches on the `groceries` flag.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { Collections, getCollection } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { GroceryItem, GroceryItemFormData } from '../types';

export function useCreateGroceryItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GroceryItemFormData) => {
      logger.info(`Creating grocery item: ${data.name}`);
      const body = {
        name: data.name,
        notes: data.notes || '',
        store: data.store || '',
        checked: false,
      };
      if (isAepbaseEnabled('groceries')) {
        return await aepbase.create<GroceryItem>(AepCollections.GROCERIES, body);
      }
      return await getCollection<GroceryItem>(Collections.GROCERIES).create(body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('groceries').list() });
    },
    onError: (error) => {
      logger.error('Failed to create grocery item', error);
    },
  });
}
