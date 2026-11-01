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
} from '../persistQueryClient';

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

describe('createOfflinePersister', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns a non-null persister in the browser environment', () => {
    expect(createOfflinePersister()).not.toBeNull();
  });

  it('reads previously stored client state through restoreClient', async () => {
    const state = {
      buster: PERSIST_BUSTER,
      timestamp: Date.now(),
      clientState: { mutations: [], queries: [] },
    };
    window.localStorage.setItem('homeos:rq:v2', JSON.stringify(state));
    const persister = createOfflinePersister();
    const restored = await persister!.restoreClient();
    expect(restored).toEqual(state);
  });

  it('does not throw when localStorage.setItem throws (quota exceeded)', async () => {
    const persister = createOfflinePersister();
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });

    let threw = false;
    try {
      await persister!.persistClient({
        buster: 'test',
        timestamp: Date.now(),
        clientState: { mutations: [], queries: [] },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);

    spy.mockRestore();
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

  beforeEach(() => {
    window.localStorage.clear();
  });

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
    window.localStorage.setItem(PERSISTER_STORAGE_KEY, JSON.stringify(stale));

    // The new build restores through the real React Query path.
    const sent = vi.fn(async (vars: { name: string }) => vars.name);
    const after = new QueryClient();
    after.setMutationDefaults(KEY, { mutationFn: sent, networkMode: 'online' });
    await persistQueryClientRestore({
      queryClient: after,
      persister: createOfflinePersister()!,
      buster: PERSIST_BUSTER,
      maxAge: PERSIST_MAX_AGE_MS,
    });
    expect(after.getMutationCache().getAll()).toHaveLength(1);

    onlineManager.setOnline(true);
    await after.resumePausedMutations();
    expect(sent).toHaveBeenCalledWith({ name: 'milk' }, expect.anything());
  });
});
