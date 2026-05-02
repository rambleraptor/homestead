import { useMutation } from '@tanstack/react-query';
import {
  GroceryMutationKeys,
  newTempId,
  type CreateStoreVars,
} from '../registerMutationDefaults';
import type { Store } from '../types';

interface CreateStoreInput {
  name: string;
  sort_order?: number;
}

/**
 * Thin shell — see `registerMutationDefaults.ts`. Injects a stable tempId
 * so optimistic + persisted state share one handle.
 */
export function useCreateStore() {
  const mutation = useMutation<Store, Error, CreateStoreVars>({
    mutationKey: GroceryMutationKeys.createStore,
  });

  return {
    ...mutation,
    mutate: (vars: CreateStoreInput) =>
      mutation.mutate({ ...vars, tempId: newTempId() }),
    mutateAsync: (vars: CreateStoreInput) =>
      mutation.mutateAsync({ ...vars, tempId: newTempId() }),
  };
}
