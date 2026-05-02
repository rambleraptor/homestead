import { useMutation } from '@tanstack/react-query';
import {
  GroceryMutationKeys,
  type UpdateStoreVars,
} from '../registerMutationDefaults';
import type { Store } from '../types';

/**
 * Thin shell — see `registerMutationDefaults.ts`.
 */
export function useUpdateStore() {
  return useMutation<Store | undefined, Error, UpdateStoreVars>({
    mutationKey: GroceryMutationKeys.updateStore,
  });
}
