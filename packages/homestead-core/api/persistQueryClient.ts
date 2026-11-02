/**
 * Persistence options for the React Query cache.
 *
 * Persists every `['app', ...]`-prefixed query and mutation to the device
 * (IndexedDB, or localStorage where that's unavailable — `offlineStore.ts`)
 * so reads survive cold offline loads and queued writes survive a page
 * reload. Auth/users/roles/permissions intentionally stay out of the
 * persisted cache (token-bound, may rotate), and secret field values never
 * reach the disk (`redactSecrets.ts`).
 *
 * The persister is `null` on the server, so `PersistQueryClientProvider`
 * falls back to plain cache-only behavior there.
 */

import { timeoutManager } from '@tanstack/react-query';
import type {
  PersistQueryClientOptions,
  PersistedClient,
  Persister,
} from '@tanstack/react-query-persist-client';
import { getAllResourceDefs } from '../apps/registry';
import { logger } from '../utils/logger';
import { defaultOfflineStore, type KeyValueStore } from './offlineStore';
import {
  redactPersistedClient,
  secretFieldIndex,
  type SecretFieldIndex,
} from './redactSecrets';

export const PERSISTER_STORAGE_KEY = 'homestead:rq:v3';

/**
 * Where the snapshot lived before it moved to IndexedDB. Read once, moved
 * over (so a write queued before the upgrade isn't lost), then removed.
 */
export const LEGACY_PERSISTER_STORAGE_KEY = 'homeos:rq:v2';

// Bumped from 1s to 2s — persisting every app multiplies write pressure
// roughly 10× compared to the groceries-only baseline.
const SAVE_THROTTLE_MS = 2000;

const NEVER_PERSIST: ReadonlySet<string> = new Set([
  'auth',
  'users',
  'roles',
  'app_permissions',
]);

function legacyStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The secret fields of every installed resource; none before the registry is. */
function installedSecretFields(): SecretFieldIndex {
  try {
    return secretFieldIndex(getAllResourceDefs());
  } catch {
    return secretFieldIndex([]);
  }
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

export interface OfflinePersisterOptions {
  /** Where the snapshot is kept; the device's IndexedDB by default. */
  store?: KeyValueStore | null;
  /** Where a pre-IndexedDB snapshot may still be; localStorage by default. */
  legacy?: Storage | null;
  /** Which fields to keep off the disk; the installed resources' by default. */
  secretFields?: () => SecretFieldIndex;
}

/** A persister that can also write its pending save right away. */
export interface OfflinePersister extends Persister {
  removeClient(): Promise<void>;
  flush(): Promise<void>;
}

export function createOfflinePersister(options: OfflinePersisterOptions = {}): OfflinePersister | null {
  const store = options.store === undefined ? defaultOfflineStore() : options.store;
  if (!store) return null;
  const legacy = options.legacy === undefined ? legacyStorage() : options.legacy;
  const secretFields = options.secretFields ?? installedSecretFields;

  const serialize = (client: PersistedClient) =>
    JSON.stringify(redactPersistedClient(client, secretFields()));

  // Trailing throttle, latest snapshot wins. Timers go through React Query's
  // timeoutManager so the VM harness can cancel a save the way an unload would.
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof timeoutManager.setTimeout> | null = null;
  const save = async () => {
    if (timer !== null) timeoutManager.clearTimeout(timer);
    timer = null;
    const client = pending;
    pending = null;
    if (client) await store.set(PERSISTER_STORAGE_KEY, serialize(client));
  };

  /**
   * Move a snapshot saved before the switch to IndexedDB: write its redacted
   * copy to the new store before deleting the old one, so a crash in between
   * loses nothing, and hand back the original so this session still has
   * everything in memory.
   */
  const migrateLegacy = async (): Promise<PersistedClient | undefined> => {
    const raw = legacy?.getItem(LEGACY_PERSISTER_STORAGE_KEY);
    if (!raw) return undefined;
    try {
      const client = JSON.parse(raw) as PersistedClient;
      await store.set(PERSISTER_STORAGE_KEY, serialize(client));
      return client;
    } catch (err) {
      logger.warn('Discarding an unreadable offline cache from localStorage', {
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    } finally {
      legacy?.removeItem(LEGACY_PERSISTER_STORAGE_KEY);
    }
  };

  return {
    persistClient: (client) => {
      pending = client;
      timer ??= timeoutManager.setTimeout(() => void save(), SAVE_THROTTLE_MS);
    },
    restoreClient: async () => {
      const raw = await store.get(PERSISTER_STORAGE_KEY);
      const persisted = raw ? (JSON.parse(raw) as PersistedClient) : await migrateLegacy();
      return persisted
        ? salvageQueuedWrites(persisted, {
            buster: PERSIST_BUSTER,
            maxAge: PERSIST_MAX_AGE_MS,
            now: Date.now(),
          })
        : undefined;
    },
    removeClient: async () => {
      if (timer !== null) timeoutManager.clearTimeout(timer);
      timer = null;
      pending = null;
      legacy?.removeItem(LEGACY_PERSISTER_STORAGE_KEY);
      await store.delete(PERSISTER_STORAGE_KEY);
    },
    flush: save,
  };
}

const persister = createOfflinePersister();

/**
 * Save right away when the app is hidden, not up to two seconds later: on a
 * phone, switching away is often the last thing that happens before the
 * system kills the page, and the write just queued would go with it.
 */
if (persister && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persister.flush();
  });
}

/**
 * Drop the persisted React Query snapshot. Called on logout / user change so
 * the next mount of `PersistQueryClientProvider` doesn't rehydrate a previous
 * user's optimistic state into the new session. Matches the in-memory
 * `queryClient.clear()` happening at the same time; a save still pending is
 * cancelled with it.
 */
export function clearPersistedQueryCache(): void {
  // Ignored — storage errors shouldn't break logout.
  persister?.removeClient().catch(() => {});
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
  persister: persister as NonNullable<typeof persister>,
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
