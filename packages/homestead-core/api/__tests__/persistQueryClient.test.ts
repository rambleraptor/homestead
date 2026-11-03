/**
 * Persistence options — every `['app', ...]`-prefixed query/mutation is
 * dehydrated; auth/user/role keys are excluded; mutations tagged
 * non-queueable (e.g. multipart writes) are skipped.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Mutation,
  MutationCache,
  Query,
  QueryCache,
  QueryClient,
  dehydrate as dehydrateClient,
  hashKey,
  onlineManager,
} from '@tanstack/react-query';
import type { PersistedClient } from '@tanstack/react-query-persist-client';
import { persistQueryClientRestore } from '@tanstack/react-query-persist-client';
import {
  persistOptions,
  createOfflinePersister,
  isPersistableKey,
  salvageQueuedWrites,
  PERSIST_BUSTER,
  PERSIST_MAX_AGE_MS,
  PERSISTER_STORAGE_KEY,
  LEGACY_PERSISTER_STORAGE_KEY,
} from '../persistQueryClient';
import type { KeyValueStore } from '../offlineStore';
import { secretFieldIndex } from '../redactSecrets';
import type { ResourceDefinition } from '../../resources/types';

const dehydrate = persistOptions.dehydrateOptions!;

function makeQuery(queryKey: readonly unknown[]): Query {
  const cache = new QueryCache();
  return cache.build(new QueryClient(), {
    queryKey: [...queryKey],
    queryHash: hashKey(queryKey),
  }) as unknown as Query;
}

function makeMutation(
  mutationKey: readonly unknown[] | undefined,
  meta?: Record<string, unknown>,
): Mutation {
  const cache = new MutationCache();
  return cache.build(new QueryClient(), {
    mutationKey: mutationKey ? [...mutationKey] : undefined,
    meta,
  }) as unknown as Mutation;
}

describe('shouldDehydrateQuery', () => {
  it('matches every app-prefixed key (groceries, gift-cards, credit-cards, …)', () => {
    expect(
      dehydrate.shouldDehydrateQuery!(makeQuery(['app', 'groceries', 'list'])),
    ).toBe(true);
    expect(
      dehydrate.shouldDehydrateQuery!(
        makeQuery(['app', 'groceries', 'detail', 'stores']),
      ),
    ).toBe(true);
    expect(
      dehydrate.shouldDehydrateQuery!(makeQuery(['app', 'gift-cards', 'list'])),
    ).toBe(true);
    expect(
      dehydrate.shouldDehydrateQuery!(makeQuery(['app', 'credit-cards', 'list'])),
    ).toBe(true);
  });

  it('rejects auth, users, roles, app_permissions', () => {
    expect(dehydrate.shouldDehydrateQuery!(makeQuery(['auth', 'user']))).toBe(false);
    expect(dehydrate.shouldDehydrateQuery!(makeQuery(['users', 'list']))).toBe(false);
    expect(dehydrate.shouldDehydrateQuery!(makeQuery(['roles']))).toBe(false);
    expect(
      dehydrate.shouldDehydrateQuery!(makeQuery(['app_permissions', 'all'])),
    ).toBe(false);
  });
});

describe('shouldDehydrateMutation', () => {
  it('matches app-prefixed mutation keys', () => {
    expect(
      dehydrate.shouldDehydrateMutation!(
        makeMutation(['app', 'groceries', 'create-item']),
      ),
    ).toBe(true);
    expect(
      dehydrate.shouldDehydrateMutation!(
        makeMutation(['app', 'credit-cards', 'create-credit-card']),
      ),
    ).toBe(true);
  });

  it('rejects unkeyed mutations', () => {
    expect(dehydrate.shouldDehydrateMutation!(makeMutation(undefined))).toBe(false);
  });

  it('skips mutations tagged non-queueable (e.g. multipart uploads)', () => {
    expect(
      dehydrate.shouldDehydrateMutation!(
        makeMutation(['app', 'groceries', 'upload-image'], {
          offlineQueueable: false,
        }),
      ),
    ).toBe(false);
  });
});

describe('isPersistableKey', () => {
  it('accepts app-prefixed keys', () => {
    expect(isPersistableKey(['app', 'groceries', 'list'])).toBe(true);
    expect(isPersistableKey(['app', 'gift-cards'])).toBe(true);
  });

  it('rejects auth and other non-app keys', () => {
    expect(isPersistableKey(['auth', 'user'])).toBe(false);
    expect(isPersistableKey(['users'])).toBe(false);
    expect(isPersistableKey([])).toBe(false);
    expect(isPersistableKey([42])).toBe(false);
  });
});

/** An in-memory stand-in for the device store. */
function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    delete: async (key) => void data.delete(key),
  };
}

const GIFT_CARD_SECRETS = () =>
  secretFieldIndex([
    {
      singular: 'gift-card',
      plural: 'gift-cards',
      fields: {
        merchant: { type: 'string' },
        card_number: { type: 'string', encrypted: true },
        pin: { type: 'string', encrypted: true },
      },
    } as unknown as ResourceDefinition,
  ]);

function clientWith(queries: unknown[], mutations: unknown[] = []): PersistedClient {
  return {
    buster: PERSIST_BUSTER,
    timestamp: Date.now(),
    clientState: { queries, mutations } as unknown as PersistedClient['clientState'],
  };
}

const giftCardList = (data: unknown) => ({
  queryKey: ['app', 'gift-cards', 'gift-card', 'list'],
  queryHash: '["app","gift-cards","gift-card","list"]',
  state: { data, status: 'success' },
});

describe('createOfflinePersister', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('is null without anywhere to store', () => {
    expect(createOfflinePersister({ store: null })).toBeNull();
  });

  it('saves at most once per throttle window, latest snapshot wins', async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    const persister = createOfflinePersister({ store, legacy: null })!;
    persister.persistClient(clientWith([giftCardList([{ id: 'a' }])]));
    persister.persistClient(clientWith([giftCardList([{ id: 'b' }])]));
    expect(store.data.size).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.data.get(PERSISTER_STORAGE_KEY)).toContain('"id":"b"');
    expect(store.data.get(PERSISTER_STORAGE_KEY)).not.toContain('"id":"a"');
  });

  it('flush writes a pending save right away', async () => {
    const store = memoryStore();
    const persister = createOfflinePersister({ store, legacy: null })!;
    persister.persistClient(clientWith([giftCardList([{ id: 'a' }])]));
    await persister.flush();
    expect(store.data.get(PERSISTER_STORAGE_KEY)).toContain('"id":"a"');
  });

  it('reads back what it saved', async () => {
    const store = memoryStore();
    const persister = createOfflinePersister({ store, legacy: null })!;
    const saved = clientWith([giftCardList([{ id: 'a', merchant: 'Acme' }])]);
    persister.persistClient(saved);
    await persister.flush();
    expect(await persister.restoreClient()).toEqual(saved);
  });

  it('never writes a secret field to the store', async () => {
    const store = memoryStore();
    const persister = createOfflinePersister({ store, legacy: null, secretFields: GIFT_CARD_SECRETS })!;
    persister.persistClient(
      clientWith([
        giftCardList([
          { id: 'a', path: 'gift-cards/a', merchant: 'Acme', card_number: '4111 2222', pin: '9876' },
        ]),
      ]),
    );
    await persister.flush();
    const saved = store.data.get(PERSISTER_STORAGE_KEY)!;
    expect(saved).toContain('Acme');
    expect(saved).not.toContain('4111 2222');
    expect(saved).not.toContain('9876');
  });

  it('removeClient deletes the snapshot and cancels a pending save', async () => {
    vi.useFakeTimers();
    const store = memoryStore();
    const persister = createOfflinePersister({ store, legacy: null })!;
    persister.persistClient(clientWith([giftCardList([{ id: 'a' }])]));
    await persister.flush();
    persister.persistClient(clientWith([giftCardList([{ id: 'b' }])]));
    await persister.removeClient();
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.data.has(PERSISTER_STORAGE_KEY)).toBe(false);
  });

  describe('moving a snapshot out of localStorage', () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    const legacySnapshot = () =>
      clientWith(
        [giftCardList([{ id: 'a', path: 'gift-cards/a', merchant: 'Acme', card_number: '4111 2222' }])],
        [
          {
            mutationKey: ['app', 'groceries', 'create-grocery'],
            state: { status: 'pending', isPaused: true, variables: { name: 'milk' } },
          },
        ],
      );

    it('hands the old snapshot to this session, whole', async () => {
      const snapshot = legacySnapshot();
      window.localStorage.setItem(LEGACY_PERSISTER_STORAGE_KEY, JSON.stringify(snapshot));
      const persister = createOfflinePersister({
        store: memoryStore(),
        legacy: window.localStorage,
        secretFields: GIFT_CARD_SECRETS,
      })!;
      expect(await persister.restoreClient()).toEqual(snapshot);
    });

    it('stores it redacted, then removes it from localStorage', async () => {
      window.localStorage.setItem(LEGACY_PERSISTER_STORAGE_KEY, JSON.stringify(legacySnapshot()));
      const store = memoryStore();
      const persister = createOfflinePersister({
        store,
        legacy: window.localStorage,
        secretFields: GIFT_CARD_SECRETS,
      })!;
      await persister.restoreClient();
      expect(window.localStorage.getItem(LEGACY_PERSISTER_STORAGE_KEY)).toBeNull();
      const moved = store.data.get(PERSISTER_STORAGE_KEY)!;
      expect(moved).toContain('milk');
      expect(moved).toContain('Acme');
      expect(moved).not.toContain('4111 2222');
    });

    it('prefers the new store once it has a snapshot', async () => {
      window.localStorage.setItem(LEGACY_PERSISTER_STORAGE_KEY, JSON.stringify(legacySnapshot()));
      const store = memoryStore();
      const current = clientWith([giftCardList([{ id: 'new' }])]);
      store.data.set(PERSISTER_STORAGE_KEY, JSON.stringify(current));
      const persister = createOfflinePersister({ store, legacy: window.localStorage })!;
      expect(await persister.restoreClient()).toEqual(current);
    });

    it('drops an unreadable old snapshot', async () => {
      window.localStorage.setItem(LEGACY_PERSISTER_STORAGE_KEY, '{not json');
      const persister = createOfflinePersister({ store: memoryStore(), legacy: window.localStorage })!;
      expect(await persister.restoreClient()).toBeUndefined();
      expect(window.localStorage.getItem(LEGACY_PERSISTER_STORAGE_KEY)).toBeNull();
    });
  });
});

/** A dehydrated mutation in a given status — enough for the salvage rule. */
function storedMutation(status: 'idle' | 'pending' | 'success' | 'error', isPaused = status === 'pending') {
  return {
    mutationKey: ['app', 'groceries', 'create-grocery'],
    state: {
      status,
      isPaused,
      variables: { name: 'milk' },
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      submittedAt: 1,
    },
  } as unknown as PersistedClient['clientState']['mutations'][number];
}

function snapshot(buster: string, timestamp: number): PersistedClient {
  return {
    buster,
    timestamp,
    clientState: {
      queries: [
        {
          queryKey: ['app', 'groceries', 'grocery', 'list'],
          queryHash: '["app","groceries","grocery","list"]',
          state: { data: [{ id: 'a' }] },
        } as unknown as PersistedClient['clientState']['queries'][number],
      ],
      mutations: [storedMutation('pending'), storedMutation('success'), storedMutation('error')],
    },
  };
}

describe('salvageQueuedWrites', () => {
  const NOW = 1_000_000_000_000;
  const opts = { buster: 'build-2', maxAge: PERSIST_MAX_AGE_MS, now: NOW };

  it('leaves a current snapshot untouched', () => {
    const current = snapshot('build-2', NOW - 1000);
    expect(salvageQueuedWrites(current, opts)).toBe(current);
  });

  it("keeps a previous build's queued writes and drops its reads", () => {
    const out = salvageQueuedWrites(snapshot('build-1', NOW - 1000), opts);
    expect(out.buster).toBe('build-2');
    expect(out.timestamp).toBe(NOW);
    expect(out.clientState.queries).toEqual([]);
    expect(out.clientState.mutations.map((m) => m.state.status)).toEqual(['pending']);
  });

  it('keeps queued writes older than maxAge', () => {
    const out = salvageQueuedWrites(snapshot('build-2', NOW - PERSIST_MAX_AGE_MS - 1), opts);
    expect(out.timestamp).toBe(NOW);
    expect(out.clientState.queries).toEqual([]);
    expect(out.clientState.mutations).toHaveLength(1);
  });

  it('keeps a write that was in flight when the tab closed', () => {
    const inFlight = { ...snapshot('build-1', NOW), clientState: { queries: [], mutations: [storedMutation('pending', false)] } };
    expect(salvageQueuedWrites(inFlight, opts).clientState.mutations).toHaveLength(1);
  });

  it('copes with a snapshot that has no client state', () => {
    const broken = { buster: 'build-1', timestamp: NOW } as PersistedClient;
    expect(salvageQueuedWrites(broken, opts).clientState).toEqual({ queries: [], mutations: [] });
  });
});

describe('restoring a snapshot from an earlier build', () => {
  const KEY = ['app', 'groceries', 'create-grocery'];

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it('replays the write that was queued offline before the update', async () => {
    // The old build: a write made offline pauses in the queue and is persisted.
    onlineManager.setOnline(false);
    const before = new QueryClient();
    before.setMutationDefaults(KEY, { mutationFn: async () => 'never sent', networkMode: 'online' });
    void before.getMutationCache().build(before, { mutationKey: KEY }).execute({ name: 'milk' });
    await vi.waitFor(() => {
      expect(before.getMutationCache().getAll()[0]?.state.isPaused).toBe(true);
    });
    const stale: PersistedClient = {
      buster: 'an-earlier-build',
      timestamp: Date.now(),
      clientState: dehydrateClient(before, persistOptions.dehydrateOptions),
    };
    const store = memoryStore();
    store.data.set(PERSISTER_STORAGE_KEY, JSON.stringify(stale));

    // The new build restores through the real React Query path.
    const sent = vi.fn(async (vars: { name: string }) => vars.name);
    const after = new QueryClient();
    after.setMutationDefaults(KEY, { mutationFn: sent, networkMode: 'online' });
    await persistQueryClientRestore({
      queryClient: after,
      persister: createOfflinePersister({ store, legacy: null })!,
      buster: PERSIST_BUSTER,
      maxAge: PERSIST_MAX_AGE_MS,
    });
    expect(after.getMutationCache().getAll()).toHaveLength(1);

    onlineManager.setOnline(true);
    await after.resumePausedMutations();
    expect(sent).toHaveBeenCalledWith({ name: 'milk' }, expect.anything());
  });
});
