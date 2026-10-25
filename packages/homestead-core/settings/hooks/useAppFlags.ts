/**
 * Fetch the household-wide app-flags singleton and unflatten it
 * into a `{ appId: { key: value } }` tree, with declared defaults
 * merged in so every known flag has a value.
 *
 * This is the internal plumbing hook. Components should use
 * `useAppFlag` for a typed single-flag accessor.
 */

import { APP_FLAGS } from '@rambleraptor/homestead-core/app-flags/sync';
import { useQuery } from '@tanstack/react-query';
import { aepbase, AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import { getAllAppFlagDefs } from '@rambleraptor/homestead-core/apps/registry';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { unflatten, unflattenAudiences, type AppFlagAudiences, type AppFlagValues } from '../flags';

export const APP_FLAGS_QUERY_KEY = ['app-flags'] as const;

export interface AppFlagsRecord {
  id: string;
  [field: string]: unknown;
}

export interface UseAppFlagsResult {
  /** Every flag's stored value (or default) — before any audience is applied. */
  values: AppFlagValues;
  /** Who each stored value applies to. */
  audiences: AppFlagAudiences;
  record: AppFlagsRecord | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAppFlags(): UseAppFlagsResult {
  const query = useQuery({
    queryKey: APP_FLAGS_QUERY_KEY,
    // This hook is on the hot path for every authenticated page. Keep
    // it quiet: don't retry on error, don't refetch on window focus —
    // callers tolerate stale values.
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AppFlagsRecord | null> => {
      try {
        const list = await aepbase.list<AppFlagsRecord>(
          APP_FLAGS,
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
        logger.warn('Failed to fetch app-flags singleton', {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },
  });

  const defs = getAllAppFlagDefs();
  const values = unflatten(query.data ?? null, defs);
  const audiences = unflattenAudiences(query.data ?? null, defs);

  return {
    values,
    audiences,
    record: query.data ?? null,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}
