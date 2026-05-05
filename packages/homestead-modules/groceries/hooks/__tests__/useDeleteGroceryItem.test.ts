import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { clearTempIdMaps } from '@rambleraptor/homestead-core/api/registerResourceMutationDefaults';
import type { GroceryItem } from '../../types';
import { groceryKeys, makeGroceriesClient, runMutation } from './testUtils';

const ITEMS_KEY = queryKeys.module('groceries').resource('grocery').list();

beforeEach(() => {
  vi.clearAllMocks();
  clearTempIdMaps();
});

describe('delete-grocery mutation', () => {
  it('removes the item optimistically and calls aepbase.remove', async () => {
    const client = makeGroceriesClient();
    const seed: GroceryItem[] = [
      {
        id: 'srv-1',
        name: 'Milk',
        checked: false,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
      },
      {
        id: 'srv-2',
        name: 'Bread',
        checked: false,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
      },
    ];
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, seed);
    vi.mocked(aepbase.remove).mockResolvedValueOnce(undefined);

    await runMutation(client, groceryKeys.delete, 'srv-1');

    expect(aepbase.remove).toHaveBeenCalledWith('groceries', 'srv-1');
    const list = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    expect(list.map((i) => i.id)).toEqual(['srv-2']);
  });

  it('rolls back to the prior list when the server rejects', async () => {
    const client = makeGroceriesClient();
    const seed: GroceryItem[] = [
      {
        id: 'srv-1',
        name: 'Milk',
        checked: false,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
      },
    ];
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, seed);
    vi.mocked(aepbase.remove).mockRejectedValueOnce(new Error('forbidden'));

    await expect(
      runMutation(client, groceryKeys.delete, 'srv-1'),
    ).rejects.toThrow();

    expect(client.getQueryData<GroceryItem[]>(ITEMS_KEY)).toEqual(seed);
  });
});
