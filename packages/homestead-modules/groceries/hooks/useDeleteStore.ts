import { useMutation } from '@tanstack/react-query';
import {
  GroceryMutationKeys,
  type DeleteStoreVars,
} from '../registerMutationDefaults';

/**
 * Thin shell — see `registerMutationDefaults.ts`.
 */
export function useDeleteStore() {
  return useMutation<string, Error, DeleteStoreVars>({
    mutationKey: GroceryMutationKeys.deleteStore,
  });
}
