/**
 * Persistence options for the React Query cache.
 *
 * Scoped to the groceries module: only `['module','groceries',...]` queries
 * and mutations get dehydrated to localStorage. The rest of the app continues
 * working as today.
 *
 * The sync persister mirrors the SSR-safe pattern from
 * `src/modules/games/bridge/storage.ts` — `createGroceriesPersister()` returns
 * `null` on the server so `PersistQueryClientProvider` falls back to plain
 * cache-only behavior during render.
 */

import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { logger } from '../utils/logger';

const STORAGE_KEY = 'homeos:rq:groceries:v1';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/** Wrap localStorage so a quota overflow is logged and dropped, not thrown. */
function quotaSafeStorage(): Storage {
  const ls = window.localStorage;
  return {
    getItem: (k) => ls.getItem(k),
    setItem: (k, v) => {
      try {
        ls.setItem(k, v);
      } catch (err) {
        logger.warn('Failed to persist React Query cache to localStorage', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    removeItem: (k) => ls.removeItem(k),
    clear: () => ls.clear(),
    key: (i) => ls.key(i),
    get length() {
      return ls.length;
    },
  };
}

export function createGroceriesPersister() {
  if (!hasStorage()) return null;
  return createSyncStoragePersister({
    storage: quotaSafeStorage(),
    key: STORAGE_KEY,
    throttleTime: 1000,
  });
}

function isGroceryKey(key: readonly unknown[]): boolean {
  return Array.isArray(key) && key[0] === 'module' && key[1] === 'groceries';
}

/**
 * Options for `<PersistQueryClientProvider>`. The `persister` is `null` on
 * the server; the provider tolerates this and behaves like a plain
 * QueryClientProvider during SSR.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createGroceriesPersister() as NonNullable<
    ReturnType<typeof createGroceriesPersister>
  >,
  // 7 days — long enough to survive a holiday weekend without connectivity.
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // Bust the persisted cache on each deploy. NEXT_PUBLIC_BUILD_ID is exposed
  // by Next.js when set; falls back to a stable string in dev.
  buster: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => isGroceryKey(query.queryKey),
    shouldDehydrateMutation: (mutation) => {
      const key = mutation.options.mutationKey;
      return Array.isArray(key) && isGroceryKey(key);
    },
  },
};
