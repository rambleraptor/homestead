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

describe('update-grocery mutation', () => {
  it('toggles checked optimistically, persists on success', async () => {
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
    vi.mocked(aepbase.update).mockResolvedValueOnce({
      ...seed[0],
      checked: true,
      updated: '2026-04-27T00:00:00Z',
    });

    await runMutation(client, groceryKeys.update, {
      id: 'srv-1',
      data: { checked: true },
    });

    expect(aepbase.update).toHaveBeenCalledWith('groceries', 'srv-1', { checked: true });
    const list = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    expect(list[0].checked).toBe(true);
  });

  it('rolls back to the prior list on error', async () => {
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

    vi.mocked(aepbase.update).mockRejectedValueOnce(new Error('boom'));

    await expect(
      runMutation(client, groceryKeys.update, {
        id: 'srv-1',
        data: { checked: true },
      }),
    ).rejects.toThrow();

    expect(client.getQueryData<GroceryItem[]>(ITEMS_KEY)).toEqual(seed);
  });
});
