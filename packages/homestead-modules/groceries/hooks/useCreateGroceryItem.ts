import { useMutation } from '@tanstack/react-query';
import {
  GroceryMutationKeys,
  newTempId,
  type CreateItemVars,
} from '../registerMutationDefaults';
import type { GroceryItem, GroceryItemFormData } from '../types';

/**
 * Thin shell over the `create-item` mutation defaults registered on the
 * QueryClient. The `mutationFn`, optimistic updates, rollback, and tempId
 * reconciliation all live in `registerMutationDefaults.ts` so they can be
 * resumed across page reloads when offline.
 *
 * The hook injects a stable `tempId` before delegating so the optimistic
 * record and any subsequent updates/deletes targeting the same row share
 * one identifier all the way through the persisted mutation queue.
 */
export function useCreateGroceryItem() {
  const mutation = useMutation<GroceryItem, Error, CreateItemVars>({
    mutationKey: GroceryMutationKeys.createItem,
  });

  return {
    ...mutation,
    mutate: (vars: GroceryItemFormData) =>
      mutation.mutate({ ...vars, tempId: newTempId() }),
    mutateAsync: (vars: GroceryItemFormData) =>
      mutation.mutateAsync({ ...vars, tempId: newTempId() }),
  };
}
