/**
 * Thin generic hooks that bind to mutation defaults registered via
 * `registerResourceMutationDefaults`. Modules wrap these to expose
 * domain-specific names (e.g. `useCreateCreditCard`).
 */

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import {
  newTempId,
  resourceMutationKeys,
  type CreateVarsBase,
  type UpdateVars,
} from './registerResourceMutationDefaults';

/**
 * Create-mutation wrapper. The hook auto-injects a stable `tempId` on each
 * call so optimistic + persisted state share one handle through the queue.
 */
export function useResourceCreate<T, V extends object>(
  moduleId: string,
  singular: string,
): UseMutationResult<T, Error, V> & {
  mutate: (vars: V) => void;
  mutateAsync: (vars: V) => Promise<T>;
} {
  const keys = resourceMutationKeys(moduleId, singular);
  const mutation = useMutation<T, Error, V & CreateVarsBase>({
    mutationKey: keys.create as unknown as readonly unknown[],
  });

  return {
    ...mutation,
    mutate: (vars: V) =>
      mutation.mutate({ ...(vars as object), tempId: newTempId() } as V & CreateVarsBase),
    mutateAsync: (vars: V) =>
      mutation.mutateAsync({
        ...(vars as object),
        tempId: newTempId(),
      } as V & CreateVarsBase),
  } as UseMutationResult<T, Error, V> & {
    mutate: (vars: V) => void;
    mutateAsync: (vars: V) => Promise<T>;
  };
}

/** Update-mutation wrapper. Variables are `{ id, data }`. */
export function useResourceUpdate<T, U = Record<string, unknown>>(
  moduleId: string,
  singular: string,
): UseMutationResult<T | undefined, Error, UpdateVars<U>> {
  const keys = resourceMutationKeys(moduleId, singular);
  return useMutation<T | undefined, Error, UpdateVars<U>>({
    mutationKey: keys.update as unknown as readonly unknown[],
  });
}

/** Delete-mutation wrapper. Variables: the record id. */
export function useResourceDelete(
  moduleId: string,
  singular: string,
): UseMutationResult<string, Error, string> {
  const keys = resourceMutationKeys(moduleId, singular);
  return useMutation<string, Error, string>({
    mutationKey: keys.delete as unknown as readonly unknown[],
  });
}
