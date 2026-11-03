/**
 * useDeleteStore deletes the store record AND every grocery item assigned to
 * it, while leaving storeless items (and items in other stores) untouched.
 * Member items go through the normal grocery-delete mutation, so the cascade
 * is optimistic and offline-safe — the member list is read from the cache.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { useDeleteStore } from '../useDeleteStore';
import type { GroceryItem, Store } from '../../types';
import { makeGroceriesClient, resetOutbox } from './testUtils';

const STORES_KEY = queryKeys.app('groceries').resource('store').list();
const ITEMS_KEY = queryKeys.app('groceries').resource('grocery').list();

function item(id: string, store: string): GroceryItem {
  return {
    id,
    name: id,
    store,
    checked: false,
    created: '2026-04-26T00:00:00Z',
    updated: '2026-04-26T00:00:00Z',
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await resetOutbox();
});

describe('useDeleteStore', () => {
  it('deletes the store and only the items assigned to it', async () => {
    const client = makeGroceriesClient();
    client.setQueryData<Store[]>(STORES_KEY, [
      {
        id: 'store-1',
        name: 'Aldi',
        sort_order: 0,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
      },
    ]);
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, [
      item('item-1', 'store-1'), // member — deleted
      item('item-2', ''), // No Store — kept
      item('item-3', 'store-2'), // other store — kept
    ]);
    vi.mocked(aepbase.remove).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteStore(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      result.current.mutate('store-1');
    });

    await waitFor(() =>
      expect(aepbase.remove).toHaveBeenCalledWith('stores', 'store-1', {
        force: true,
      }),
    );
    expect(aepbase.remove).toHaveBeenCalledWith('groceries', 'item-1', {
      force: true,
    });
    const targets = vi.mocked(aepbase.remove).mock.calls.map((c) => c[1]);
    expect(targets).not.toContain('item-2');
    expect(targets).not.toContain('item-3');

    // Cache reflects the cascade optimistically: store gone, member item gone,
    // storeless + other-store items retained.
    await waitFor(() =>
      expect(client.getQueryData<Store[]>(STORES_KEY) ?? []).toHaveLength(0),
    );
    const remaining = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    expect(remaining.map((i) => i.id).sort()).toEqual(['item-2', 'item-3']);
  });

  it('deletes a childless store without touching any items', async () => {
    const client = makeGroceriesClient();
    client.setQueryData<Store[]>(STORES_KEY, [
      {
        id: 'store-1',
        name: 'Aldi',
        sort_order: 0,
        created: '2026-04-26T00:00:00Z',
        updated: '2026-04-26T00:00:00Z',
      },
    ]);
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, [item('item-1', '')]);
    vi.mocked(aepbase.remove).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteStore(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    await act(async () => {
      result.current.mutate('store-1');
    });

    await waitFor(() =>
      expect(aepbase.remove).toHaveBeenCalledWith('stores', 'store-1', {
        force: true,
      }),
    );
    expect(aepbase.remove).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<GroceryItem[]>(ITEMS_KEY)).toHaveLength(1);
  });
});
