/**
 * Optimistic create flow + tempId reconciliation.
 *
 * The mutation defaults live on the QueryClient, so we register them once
 * per test against a fresh client. The aepbase client is the global mock
 * from `src/test/setup.ts` — we override `create` per test as needed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import {
  registerGroceryMutationDefaults,
  GroceryMutationKeys,
  clearTempIdMaps,
  newTempId,
} from '../../registerMutationDefaults';
import type { GroceryItem } from '../../types';
import { runMutation } from './testUtils';

const ITEMS_KEY = queryKeys.module('groceries').list();

function makeClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  registerGroceryMutationDefaults(client);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearTempIdMaps();
});

describe('create-item mutation', () => {
  it('inserts an optimistic record before the server responds', async () => {
    const client = makeClient();
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, []);

    let resolveCreate!: (item: GroceryItem) => void;
    vi.mocked(aepbase.create).mockImplementationOnce(
      () => new Promise((res) => (resolveCreate = res as (item: GroceryItem) => void)),
    );

    const tempId = newTempId();
    const promise = runMutation<GroceryItem>(
      client,
      GroceryMutationKeys.createItem,
      { name: 'Milk', tempId },
    );

    // Optimistic record visible immediately.
    await vi.waitFor(() => {
      const list = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(tempId);
      expect(list[0].name).toBe('Milk');
      expect(list[0].checked).toBe(false);
    });

    // Server resolves with the real id.
    resolveCreate({
      id: 'srv-1',
      name: 'Milk',
      checked: false,
      created: '2026-04-27T00:00:00Z',
      updated: '2026-04-27T00:00:00Z',
    });
    await promise;

    const list = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('srv-1');
  });

  it('rolls back the cache on server error', async () => {
    const client = makeClient();
    const seed: GroceryItem[] = [
      {
        id: 'existing',
        name: 'Bread',
        checked: false,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
      },
    ];
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, seed);

    vi.mocked(aepbase.create).mockRejectedValueOnce(new Error('network down'));

    await expect(
      runMutation(client, GroceryMutationKeys.createItem, {
        name: 'Eggs',
        tempId: newTempId(),
      }),
    ).rejects.toThrow();

    expect(client.getQueryData<GroceryItem[]>(ITEMS_KEY)).toEqual(seed);
  });
});

describe('temp-id reconciliation', () => {
  it('rewrites a follow-up update from tempId to the real server id', async () => {
    const client = makeClient();
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, []);

    vi.mocked(aepbase.create).mockResolvedValueOnce({
      id: 'srv-2',
      name: 'Cheese',
      checked: false,
      created: '2026-04-27T00:00:00Z',
      updated: '2026-04-27T00:00:00Z',
    });
    vi.mocked(aepbase.update).mockResolvedValueOnce({
      id: 'srv-2',
      name: 'Cheese',
      checked: true,
      created: '2026-04-27T00:00:00Z',
      updated: '2026-04-27T00:00:01Z',
    });

    const tempId = newTempId();
    await runMutation(client, GroceryMutationKeys.createItem, {
      name: 'Cheese',
      tempId,
    });

    await runMutation(client, GroceryMutationKeys.updateItem, {
      id: tempId,
      data: { checked: true },
    });

    expect(aepbase.update).toHaveBeenCalledWith('groceries', 'srv-2', {
      checked: true,
    });
  });

  it('skips the network call when deleting an item whose create is still pending', async () => {
    const client = makeClient();
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, []);

    let resolveCreate!: () => void;
    vi.mocked(aepbase.create).mockImplementationOnce(
      () =>
        new Promise<GroceryItem>((res) => {
          resolveCreate = () =>
            res({
              id: 'srv-3',
              name: 'Salt',
              checked: false,
              created: '2026-04-27T00:00:00Z',
              updated: '2026-04-27T00:00:00Z',
            });
        }),
    );

    const tempId = newTempId();
    // Fire create but don't await it.
    const createPromise = runMutation(client, GroceryMutationKeys.createItem, {
      name: 'Salt',
      tempId,
    });

    await vi.waitFor(() => {
      expect(client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? []).toHaveLength(1);
    });

    await runMutation(client, GroceryMutationKeys.deleteItem, tempId);

    expect(aepbase.remove).not.toHaveBeenCalled();
    expect(client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? []).toHaveLength(0);

    // Resolving the original create promise should not crash even after destroy.
    resolveCreate();
    await createPromise.catch(() => undefined);
  });
});
