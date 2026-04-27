import { useMutation } from '@tanstack/react-query';
import {
  GroceryMutationKeys,
  type UpdateItemVars,
} from '../registerMutationDefaults';
import type { GroceryItem } from '../types';

/**
 * Thin shell — see `registerMutationDefaults.ts` for the optimistic /
 * offline-resumable implementation.
 */
export function useUpdateGroceryItem() {
  return useMutation<GroceryItem | undefined, Error, UpdateItemVars>({
    mutationKey: GroceryMutationKeys.updateItem,
  });
}
