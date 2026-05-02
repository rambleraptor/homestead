import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { aepbase } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import {
  registerGroceryMutationDefaults,
  GroceryMutationKeys,
  clearTempIdMaps,
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

describe('update-item mutation', () => {
  it('toggles checked optimistically, persists on success', async () => {
    const client = makeClient();
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

    await runMutation(client, GroceryMutationKeys.updateItem, {
      id: 'srv-1',
      data: { checked: true },
    });

    expect(aepbase.update).toHaveBeenCalledWith('groceries', 'srv-1', { checked: true });
    const list = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    expect(list[0].checked).toBe(true);
  });

  it('rolls back to the prior list on error', async () => {
    const client = makeClient();
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
      runMutation(client, GroceryMutationKeys.updateItem, {
        id: 'srv-1',
        data: { checked: true },
      }),
    ).rejects.toThrow();

    expect(client.getQueryData<GroceryItem[]>(ITEMS_KEY)).toEqual(seed);
  });
});
