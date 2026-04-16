/**
 * Fetch the household-wide module-flags singleton and unflatten it
 * into a `{ moduleId: { key: value } }` tree, with declared defaults
 * merged in so every known flag has a value.
 *
 * This is the internal plumbing hook. Components should use
 * `useModuleFlag` for a typed single-flag accessor.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections, AepbaseError } from '@/core/api/aepbase';
import { getAllModuleFlagDefs } from '@/modules/registry';
import { logger } from '@/core/utils/logger';
import { unflatten, type ModuleFlagValues } from '../flags';

export const MODULE_FLAGS_QUERY_KEY = ['module-flags'] as const;

export interface ModuleFlagsRecord {
  id: string;
  [field: string]: unknown;
}

export interface UseModuleFlagsResult {
  values: ModuleFlagValues;
  record: ModuleFlagsRecord | null;
  isLoading: boolean;
  error: Error | null;
}

export function useModuleFlags(): UseModuleFlagsResult {
  const query = useQuery({
    queryKey: MODULE_FLAGS_QUERY_KEY,
    // This hook is on the hot path for every authenticated page (via
    // Header → useCanUseOmnibox). Keep it quiet: don't retry on error,
    // don't refetch on window focus — callers tolerate stale values.
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ModuleFlagsRecord | null> => {
      try {
        const list = await aepbase.list<ModuleFlagsRecord>(
          AepCollections.MODULE_FLAGS,
        );
        return list.length > 0 ? list[0] : null;
      } catch (error) {
        // 404 is the expected state when the resource definition hasn't
        // been registered yet (no admin creds in the Next.js env).
        // Treat that as "no flags set yet" silently. Other errors get
        // a warning so regressions stay visible.
        if (error instanceof AepbaseError && error.code === 404) {
          return null;
        }
        logger.warn('Failed to fetch module-flags singleton', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
  });

  const defs = getAllModuleFlagDefs();
  const values = unflatten(query.data ?? null, defs);

  return {
    values,
    record: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
