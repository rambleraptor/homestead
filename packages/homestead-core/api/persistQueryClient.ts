/**
 * Persistence options for the React Query cache.
 *
 * Persists every `['module', ...]`-prefixed query and mutation to
 * localStorage so reads survive cold offline loads and queued writes
 * survive a page reload. Auth/users/roles/permissions intentionally
 * stay out of the persisted cache (token-bound, may rotate).
 *
 * The sync persister returns `null` on the server so
 * `PersistQueryClientProvider` falls back to plain cache-only behavior
 * during SSR.
 */

import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { logger } from '../utils/logger';

const STORAGE_KEY = 'homeos:rq:v2';

const NEVER_PERSIST: ReadonlySet<string> = new Set([
  'auth',
  'users',
  'roles',
  'module_permissions',
]);

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

export function createOfflinePersister() {
  if (!hasStorage()) return null;
  return createSyncStoragePersister({
    storage: quotaSafeStorage(),
    key: STORAGE_KEY,
    // Bumped from 1s to 2s — persisting every module multiplies write
    // pressure roughly 10× compared to the groceries-only baseline.
    throttleTime: 2000,
  });
}

/**
 * Decide whether a given query/mutation key should be dehydrated.
 *
 * Rules:
 *  - Module-prefixed keys (`['module', ...]`) are persisted.
 *  - `auth`, `users`, `roles`, `module_permissions` are never persisted.
 *  - Anything else (ad-hoc keys, dev-only queries) is skipped by default.
 */
export function isPersistableKey(key: readonly unknown[]): boolean {
  if (!Array.isArray(key) || typeof key[0] !== 'string') return false;
  const head = key[0] as string;
  if (NEVER_PERSIST.has(head)) return false;
  return head === 'module';
}

/**
 * Options for `<PersistQueryClientProvider>`. The `persister` is `null` on
 * the server; the provider tolerates this and behaves like a plain
 * QueryClientProvider during SSR.
 */
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createOfflinePersister() as NonNullable<
    ReturnType<typeof createOfflinePersister>
  >,
  // 7 days — long enough to survive a holiday weekend without connectivity.
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // Bust the persisted cache on each deploy. NEXT_PUBLIC_BUILD_ID is exposed
  // by Next.js when set; falls back to a stable string in dev.
  buster: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => isPersistableKey(query.queryKey),
    shouldDehydrateMutation: (mutation) => {
      const key = mutation.options.mutationKey;
      if (!Array.isArray(key) || !isPersistableKey(key)) return false;
      // FormData / multipart writes are non-serializable. Resource
      // factories tag those with `meta.offlineQueueable: false`; the
      // UI is expected to disable the trigger when offline.
      const meta = mutation.options.meta as
        | { offlineQueueable?: boolean }
        | undefined;
      if (meta?.offlineQueueable === false) return false;
      return true;
    },
  },
};
