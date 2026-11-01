/**
 * Persistence options for the React Query cache.
 *
 * Persists every `['app', ...]`-prefixed query and mutation to
 * localStorage so reads survive cold offline loads and queued writes
 * survive a page reload. Auth/users/roles/permissions intentionally
 * stay out of the persisted cache (token-bound, may rotate).
 *
 * The sync persister returns `null` on the server so
 * `PersistQueryClientProvider` falls back to plain cache-only behavior
 * during SSR.
 */

import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type {
  PersistQueryClientOptions,
  PersistedClient,
  Persister,
} from '@tanstack/react-query-persist-client';
import { logger } from '../utils/logger';

export const PERSISTER_STORAGE_KEY = 'homeos:rq:v2';

/**
 * Drop the persisted React Query snapshot from localStorage. Called on
 * logout / user change so the next mount of `PersistQueryClientProvider`
 * doesn't rehydrate a previous user's optimistic state into the new
 * session. Matches the in-memory `queryClient.clear()` happening at the
 * same time.
 */
export function clearPersistedQueryCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PERSISTER_STORAGE_KEY);
  } catch {
    // ignored — quota errors and SecurityError shouldn't break logout
  }
}

const NEVER_PERSIST: ReadonlySet<string> = new Set([
  'auth',
  'users',
  'roles',
  'app_permissions',
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

// 7 days — long enough to survive a holiday weekend without connectivity.
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Each build gets its own cache of reads: a hook may have changed what it
// stores under a key, and new code shouldn't render a shape it never wrote.
// NEXT_PUBLIC_BUILD_ID is defined at build time (vite.config.ts); dev falls
// back to a stable string.
export const PERSIST_BUSTER = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';

/**
 * A snapshot from another build, or one older than `maxAge`, keeping only its
 * queued writes — or the snapshot unchanged when it's current.
 *
 * React Query discards such a snapshot outright on restore, and that throws
 * away writes the person made offline: a server update, or a week without
 * signal, would silently lose the groceries they added. Reads are safe to
 * drop (they refetch), so this keeps every mutation still pending (paused in
 * the queue, or in flight when the tab closed) and drops the rest. Replaying
 * one is safe: creates carry a client-chosen id, updates are merge patches,
 * and a repeated delete is a no-op (`registerResourceMutationDefaults`).
 *
 * The result carries the current buster and timestamp, so React Query's own
 * check passes and it hydrates the queue as usual.
 */
export function salvageQueuedWrites(
  persisted: PersistedClient,
  { buster, maxAge, now }: { buster: string; maxAge: number; now: number },
): PersistedClient {
  const current = persisted.buster === buster && now - persisted.timestamp <= maxAge;
  if (current) return persisted;
  return {
    buster,
    timestamp: now,
    clientState: {
      queries: [],
      mutations: (persisted.clientState?.mutations ?? []).filter(
        (mutation) => mutation.state.status === 'pending',
      ),
    },
  };
}

export function createOfflinePersister(): Persister | null {
  if (!hasStorage()) return null;
  const persister = createSyncStoragePersister({
    storage: quotaSafeStorage(),
    key: PERSISTER_STORAGE_KEY,
    // Bumped from 1s to 2s — persisting every app multiplies write
    // pressure roughly 10× compared to the groceries-only baseline.
    throttleTime: 2000,
  });
  return {
    ...persister,
    restoreClient: async () => {
      const persisted = await persister.restoreClient();
      return persisted
        ? salvageQueuedWrites(persisted, {
            buster: PERSIST_BUSTER,
            maxAge: PERSIST_MAX_AGE_MS,
            now: Date.now(),
          })
        : persisted;
    },
  };
}

/**
 * Decide whether a given query/mutation key should be dehydrated.
 *
 * Rules:
 *  - App-prefixed keys (`['app', ...]`) are persisted.
 *  - `auth`, `users`, `roles`, `app_permissions` are never persisted.
 *  - Anything else (ad-hoc keys, dev-only queries) is skipped by default.
 */
export function isPersistableKey(key: readonly unknown[]): boolean {
  if (!Array.isArray(key) || typeof key[0] !== 'string') return false;
  const head = key[0] as string;
  if (NEVER_PERSIST.has(head)) return false;
  return head === 'app';
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
  // Reads from another build or older than this are dropped on restore;
  // queued writes are kept regardless (`salvageQueuedWrites`).
  maxAge: PERSIST_MAX_AGE_MS,
  buster: PERSIST_BUSTER,
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
