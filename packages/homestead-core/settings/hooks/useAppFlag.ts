/**
 * Public hook for reading + writing a single app flag.
 *
 *   const { value, setValue } =
 *     useAppFlag<string>('groceries', 'default_store');
 *
 * Returns the declared default when nothing has been saved yet, so
 * callers never have to guard against `undefined`. `setValue` upserts
 * the household singleton and invalidates the shared query so other
 * consumers see the change on the next render.
 *
 * `value` is what the flag means *for the signed-in person*: a stored value
 * applies only within the flag's audience (see `FlagAudience`); outside it,
 * the declared default — so a feature can be tried on one group first.
 */

import { useCallback, useContext } from 'react';
import type { AppFlagValue } from '@rambleraptor/homestead-core/apps/types';
import { getAllAppFlagDefs } from '@rambleraptor/homestead-core/apps/registry';
import { AuthContext } from '../../auth/context';
import { inAudience, type FlagAudience } from '../flags';
import { useAppFlags } from './useAppFlags';
import { useUpdateAppFlag } from './useUpdateAppFlag';

export interface UseAppFlagResult<T extends AppFlagValue> {
  /** The flag as it applies to the signed-in person. */
  value: T | undefined;
  /** The stored value, whoever it applies to (what Flag Management edits). */
  storedValue: T | undefined;
  /** Who the stored value applies to. */
  audience: FlagAudience;
  /** Whether the signed-in person is in that audience. */
  inAudience: boolean;
  setValue: (value: T) => Promise<void>;
  setAudience: (audience: FlagAudience) => Promise<void>;
  isLoading: boolean;
  isSaving: boolean;
  error: Error | null;
}

export function useAppFlag<T extends AppFlagValue = AppFlagValue>(
  appId: string,
  key: string,
): UseAppFlagResult<T> {
  const { values, audiences, isLoading, error } = useAppFlags();
  const mutation = useUpdateAppFlag();
  // Read without `useAuth`'s provider check: a flag outside the signed-in
  // shell (or in a unit test) has no groups, and so is in no group audience.
  const groupNames = useContext(AuthContext)?.user?.permissions?.groupNames ?? [];

  const storedValue = values[appId]?.[key] as T | undefined;
  const audience = audiences[appId]?.[key] ?? 'everyone';
  const included = inAudience(audience, groupNames);
  const value = included
    ? storedValue
    : (getAllAppFlagDefs()[appId]?.[key]?.default as T | undefined);

  const setValue = useCallback(
    async (next: T) => {
      await mutation.mutateAsync({ appId, key, value: next });
    },
    [mutation, appId, key],
  );
  const setAudience = useCallback(
    async (next: FlagAudience) => {
      await mutation.mutateAsync({ appId, key, audience: next });
    },
    [mutation, appId, key],
  );

  return {
    value,
    storedValue,
    audience,
    inAudience: included,
    setValue,
    setAudience,
    isLoading,
    isSaving: mutation.isPending,
    error,
  };
}
