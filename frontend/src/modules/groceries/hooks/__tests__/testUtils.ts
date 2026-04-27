import { MutationObserver, type QueryClient } from '@tanstack/react-query';

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
