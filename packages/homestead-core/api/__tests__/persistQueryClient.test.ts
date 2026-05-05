/**
 * Persistence options — every `['module', ...]`-prefixed query/mutation is
 * dehydrated; auth/user/role keys are excluded; mutations tagged
 * non-queueable (e.g. multipart writes) are skipped.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Mutation,
  MutationCache,
  Query,
  QueryCache,
  QueryClient,
  hashKey,
} from '@tanstack/react-query';
import {
  persistOptions,
  createOfflinePersister,
  isPersistableKey,
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
  it('matches every module-prefixed key (groceries, gift-cards, credit-cards, …)', () => {
    expect(
      dehydrate.shouldDehydrateQuery!(makeQuery(['module', 'groceries', 'list'])),
    ).toBe(true);
    expect(
      dehydrate.shouldDehydrateQuery!(
        makeQuery(['module', 'groceries', 'detail', 'stores']),
      ),
    ).toBe(true);
    expect(
      dehydrate.shouldDehydrateQuery!(makeQuery(['module', 'gift-cards', 'list'])),
    ).toBe(true);
    expect(
      dehydrate.shouldDehydrateQuery!(makeQuery(['module', 'credit-cards', 'list'])),
    ).toBe(true);
  });

  it('rejects auth, users, roles, module_permissions', () => {
    expect(dehydrate.shouldDehydrateQuery!(makeQuery(['auth', 'user']))).toBe(false);
    expect(dehydrate.shouldDehydrateQuery!(makeQuery(['users', 'list']))).toBe(false);
    expect(dehydrate.shouldDehydrateQuery!(makeQuery(['roles']))).toBe(false);
    expect(
      dehydrate.shouldDehydrateQuery!(makeQuery(['module_permissions', 'all'])),
    ).toBe(false);
  });
});

describe('shouldDehydrateMutation', () => {
  it('matches module-prefixed mutation keys', () => {
    expect(
      dehydrate.shouldDehydrateMutation!(
        makeMutation(['module', 'groceries', 'create-item']),
      ),
    ).toBe(true);
    expect(
      dehydrate.shouldDehydrateMutation!(
        makeMutation(['module', 'credit-cards', 'create-credit-card']),
      ),
    ).toBe(true);
  });

  it('rejects unkeyed mutations', () => {
    expect(dehydrate.shouldDehydrateMutation!(makeMutation(undefined))).toBe(false);
  });

  it('skips mutations tagged non-queueable (e.g. multipart uploads)', () => {
    expect(
      dehydrate.shouldDehydrateMutation!(
        makeMutation(['module', 'groceries', 'upload-image'], {
          offlineQueueable: false,
        }),
      ),
    ).toBe(false);
  });
});

describe('isPersistableKey', () => {
  it('accepts module-prefixed keys', () => {
    expect(isPersistableKey(['module', 'groceries', 'list'])).toBe(true);
    expect(isPersistableKey(['module', 'gift-cards'])).toBe(true);
  });

  it('rejects auth and other non-module keys', () => {
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
      buster: 'test',
      timestamp: 12345,
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
