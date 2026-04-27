/**
 * Persistence options — only grocery queries/mutations are dehydrated, and
 * a localStorage quota overflow is logged + dropped (not thrown).
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
  createGroceriesPersister,
} from '@/core/api/persistQueryClient';

const dehydrate = persistOptions.dehydrateOptions!;

function makeQuery(queryKey: readonly unknown[]): Query {
  const cache = new QueryCache();
  return cache.build(new QueryClient(), {
    queryKey: [...queryKey],
    queryHash: hashKey(queryKey),
  }) as unknown as Query;
}

function makeMutation(mutationKey: readonly unknown[] | undefined): Mutation {
  const cache = new MutationCache();
  return cache.build(new QueryClient(), {
    mutationKey: mutationKey ? [...mutationKey] : undefined,
  }) as unknown as Mutation;
}

describe('shouldDehydrateQuery', () => {
  it('matches grocery list and store-detail keys', () => {
    expect(dehydrate.shouldDehydrateQuery!(makeQuery(['module', 'groceries', 'list']))).toBe(true);
    expect(
      dehydrate.shouldDehydrateQuery!(makeQuery(['module', 'groceries', 'detail', 'stores'])),
    ).toBe(true);
  });

  it('rejects keys from other modules and from auth', () => {
    expect(
      dehydrate.shouldDehydrateQuery!(makeQuery(['module', 'gift-cards', 'list'])),
    ).toBe(false);
    expect(dehydrate.shouldDehydrateQuery!(makeQuery(['auth', 'user']))).toBe(false);
    expect(dehydrate.shouldDehydrateQuery!(makeQuery(['users', 'list']))).toBe(false);
  });
});

describe('shouldDehydrateMutation', () => {
  it('matches grocery mutation keys', () => {
    expect(
      dehydrate.shouldDehydrateMutation!(
        makeMutation(['module', 'groceries', 'create-item']),
      ),
    ).toBe(true);
  });

  it('rejects unkeyed and non-grocery mutations', () => {
    expect(dehydrate.shouldDehydrateMutation!(makeMutation(undefined))).toBe(false);
    expect(
      dehydrate.shouldDehydrateMutation!(
        makeMutation(['module', 'gift-cards', 'create']),
      ),
    ).toBe(false);
  });
});

describe('createGroceriesPersister', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns a non-null persister in the browser environment', () => {
    expect(createGroceriesPersister()).not.toBeNull();
  });

  it('reads previously stored client state through restoreClient', async () => {
    const state = {
      buster: 'test',
      timestamp: 12345,
      clientState: { mutations: [], queries: [] },
    };
    window.localStorage.setItem('homeos:rq:groceries:v1', JSON.stringify(state));
    const persister = createGroceriesPersister();
    const restored = await persister!.restoreClient();
    expect(restored).toEqual(state);
  });

  it('does not throw when localStorage.setItem throws (quota exceeded)', async () => {
    const persister = createGroceriesPersister();
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
