/**
 * Where the offline cache lives on the device: a single-store IndexedDB
 * database, so the snapshot isn't squeezed into localStorage's ~5 MB (shared
 * with the session and everything else) or written synchronously on the main
 * thread.
 *
 * Where IndexedDB is missing or refuses to open (some private modes, test
 * DOMs), the same interface is served from localStorage instead, so the
 * offline cache degrades to what it was rather than to nothing.
 */

import { logger } from '../utils/logger';

/** A string-valued key-value store. Writes never throw: a full disk is logged. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const DB_NAME = 'homestead-offline';
const STORE_NAME = 'kv';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDatabase(idb: IDBFactory): Promise<IDBDatabase> {
  const open = idb.open(DB_NAME, 1);
  open.onupgradeneeded = () => {
    if (!open.result.objectStoreNames.contains(STORE_NAME)) {
      open.result.createObjectStore(STORE_NAME);
    }
  };
  return request(open);
}

function warnWriteFailed(where: string, err: unknown): void {
  logger.warn(`Failed to save the offline cache to ${where}`, {
    error: err instanceof Error ? err.message : String(err),
  });
}

/** A store over an already-open IndexedDB database. */
export function indexedDbStore(db: IDBDatabase): KeyValueStore {
  const store = (mode: IDBTransactionMode) =>
    db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  return {
    get: async (key) => ((await request(store('readonly').get(key))) as string | undefined) ?? null,
    set: async (key, value) => {
      try {
        await request(store('readwrite').put(value, key));
      } catch (err) {
        warnWriteFailed('IndexedDB', err);
      }
    },
    delete: async (key) => {
      await request(store('readwrite').delete(key));
    },
  };
}

/** A store over localStorage (or any `Storage`). */
export function localStorageStore(storage: Storage): KeyValueStore {
  return {
    get: async (key) => storage.getItem(key),
    set: async (key, value) => {
      try {
        storage.setItem(key, value);
      } catch (err) {
        warnWriteFailed('localStorage', err);
      }
    },
    delete: async (key) => storage.removeItem(key),
  };
}

/**
 * The device's offline store: IndexedDB when it opens, localStorage when it
 * doesn't, null with neither (server-side). The database opens on first use.
 */
export function defaultOfflineStore(): KeyValueStore | null {
  if (typeof window === 'undefined') return null;
  const idb = typeof indexedDB === 'undefined' ? null : indexedDB;
  const ls = (() => {
    try {
      return window.localStorage ?? null;
    } catch {
      return null; // SecurityError with storage blocked
    }
  })();
  if (!idb && !ls) return null;

  let resolved: Promise<KeyValueStore> | null = null;
  const resolve = (): Promise<KeyValueStore> => {
    resolved ??= (async () => {
      if (idb) {
        try {
          return indexedDbStore(await openDatabase(idb));
        } catch (err) {
          if (!ls) throw err;
          logger.warn('IndexedDB unavailable; keeping the offline cache in localStorage', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return localStorageStore(ls!);
    })();
    return resolved;
  };
  return {
    get: async (key) => (await resolve()).get(key),
    set: async (key, value) => (await resolve()).set(key, value),
    delete: async (key) => (await resolve()).delete(key),
  };
}
