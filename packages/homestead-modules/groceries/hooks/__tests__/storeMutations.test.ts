/**
 * Optimistic create / update / delete for the `stores` collection.
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
import type { GroceryItem, Store } from '../../types';
import { runMutation } from './testUtils';

const STORES_KEY = queryKeys.module('groceries').detail('stores');
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

describe('create-store', () => {
  it('inserts an optimistic store and reconciles with the server id', async () => {
    const client = makeClient();
    client.setQueryData<Store[]>(STORES_KEY, []);
    vi.mocked(aepbase.create).mockResolvedValueOnce({
      id: 'store-srv-1',
      name: 'Costco',
      sort_order: 0,
      created: '2026-04-27T00:00:00Z',
      updated: '2026-04-27T00:00:00Z',
    });

    const tempId = newTempId();
    await runMutation(client, GroceryMutationKeys.createStore, {
      name: 'Costco',
      sort_order: 0,
      tempId,
    });

    const list = client.getQueryData<Store[]>(STORES_KEY) ?? [];
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('store-srv-1');
  });
});

describe('update-store', () => {
  it('renames optimistically and rolls back on error', async () => {
    const client = makeClient();
    const seed: Store[] = [
      {
        id: 'store-1',
        name: 'Aldi',
        sort_order: 0,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
      },
    ];
    client.setQueryData<Store[]>(STORES_KEY, seed);
    vi.mocked(aepbase.update).mockRejectedValueOnce(new Error('boom'));

    await expect(
      runMutation(client, GroceryMutationKeys.updateStore, {
        id: 'store-1',
        data: { name: 'Trader Joes' },
      }),
    ).rejects.toThrow();

    expect(client.getQueryData<Store[]>(STORES_KEY)).toEqual(seed);
  });
});

describe('delete-store', () => {
  it('removes the store optimistically and re-homes its items to "no store"', async () => {
    const client = makeClient();
    const stores: Store[] = [
      {
        id: 'store-1',
        name: 'Aldi',
        sort_order: 0,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
      },
    ];
    const items: GroceryItem[] = [
      {
        id: 'item-1',
        name: 'Apples',
        store: 'store-1',
        checked: false,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
      },
      {
        id: 'item-2',
        name: 'Bread',
        store: '',
        checked: false,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
      },
    ];
    client.setQueryData<Store[]>(STORES_KEY, stores);
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, items);
    vi.mocked(aepbase.remove).mockResolvedValueOnce(undefined);

    await runMutation(client, GroceryMutationKeys.deleteStore, 'store-1');

    expect(aepbase.remove).toHaveBeenCalledWith('stores', 'store-1');
    const remainingStores = client.getQueryData<Store[]>(STORES_KEY) ?? [];
    expect(remainingStores).toHaveLength(0);

    const remainingItems = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    expect(remainingItems.find((i) => i.id === 'item-1')?.store).toBe('');
  });
});
