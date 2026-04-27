import { useMutation } from '@tanstack/react-query';
import {
  GroceryMutationKeys,
  type DeleteItemVars,
} from '../registerMutationDefaults';

/**
 * Thin shell — see `registerMutationDefaults.ts` for the optimistic /
 * offline-resumable implementation.
 */
export function useDeleteGroceryItem() {
  return useMutation<void, Error, DeleteItemVars>({
    mutationKey: GroceryMutationKeys.deleteItem,
  });
}
