import { MutationObserver, QueryClient } from '@tanstack/react-query';
import {
  registerResourceMutationDefaults,
  resourceMutationKeys,
} from '@rambleraptor/homestead-core/api/registerResourceMutationDefaults';
import { storeCascadeDelete } from '../../offline';
import { GROCERIES, STORES } from '../../resources';

/**
 * Fire a mutation against the QueryClient using only its registered
 * `setMutationDefaults`. Mirrors the behavior of `useMutation` (onMutate /
 * onError / onSettled all run) without dragging React into the test.
 */
export async function runMutation<TData = unknown, TVars = unknown>(
  client: QueryClient,
  mutationKey: readonly unknown[],
  variables: TVars,
): Promise<TData> {
  const observer = new MutationObserver<TData, Error, TVars>(client, {
    mutationKey: mutationKey as unknown[],
  });
  try {
    return await observer.mutate(variables);
  } finally {
    observer.reset();
  }
}

/**
 * Build a QueryClient with grocery + store resource defaults registered.
 * Mirrors what the auto-registration loop in `providers.tsx` does for the
 * groceries module at app boot.
 */
export function makeGroceriesClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  registerResourceMutationDefaults(client, {
    moduleId: 'groceries',
    singular: 'grocery',
    plural: GROCERIES,
  });
  registerResourceMutationDefaults(client, {
    moduleId: 'groceries',
    singular: 'store',
    plural: STORES,
    cascadeDelete: storeCascadeDelete,
  });
  return client;
}

export const groceryKeys = resourceMutationKeys('groceries', 'grocery');
export const storeKeys = resourceMutationKeys('groceries', 'store');
