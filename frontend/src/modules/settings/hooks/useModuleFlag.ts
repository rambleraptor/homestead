/**
 * Public hook for reading + writing a single module flag.
 *
 *   const { value, setValue } =
 *     useModuleFlag<'superuser' | 'all'>('settings', 'omnibox_access');
 *
 * Returns the declared default when nothing has been saved yet, so
 * callers never have to guard against `undefined`. `setValue` upserts
 * the household singleton and invalidates the shared query so other
 * consumers see the change on the next render.
 */

import { useCallback } from 'react';
import type { ModuleFlagValue } from '../../types';
import { useModuleFlags } from './useModuleFlags';
import { useUpdateModuleFlag } from './useUpdateModuleFlag';

export interface UseModuleFlagResult<T extends ModuleFlagValue> {
  value: T | undefined;
  setValue: (value: T) => Promise<void>;
  isLoading: boolean;
  isSaving: boolean;
  error: Error | null;
}

export function useModuleFlag<T extends ModuleFlagValue = ModuleFlagValue>(
  moduleId: string,
  key: string,
): UseModuleFlagResult<T> {
  const { values, isLoading, error } = useModuleFlags();
  const mutation = useUpdateModuleFlag();

  const value = values[moduleId]?.[key] as T | undefined;

  const setValue = useCallback(
    async (next: T) => {
      await mutation.mutateAsync({ moduleId, key, value: next });
    },
    [mutation, moduleId, key],
  );

  return {
    value,
    setValue,
    isLoading,
    isSaving: mutation.isPending,
    error,
  };
}
