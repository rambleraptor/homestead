/**
 * useClearCheckedItems deletes only the checked items of one store — unchecked
 * items and items in other stores survive — and reports what it removed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { useClearCheckedItems } from '../useClearCheckedItems';
import type { GroceryItem } from '../../types';
import { makeGroceriesClient, resetOutbox } from './testUtils';

const ITEMS_KEY = queryKeys.app('groceries').resource('grocery').list();

function item(id: string, store: string, checked: boolean): GroceryItem {
  return {
    id,
    name: id,
    store,
    checked,
    created: '2026-04-26T00:00:00Z',
    updated: '2026-04-26T00:00:00Z',
  };
}

function render(client: ReturnType<typeof makeGroceriesClient>) {
  return renderHook(() => useClearCheckedItems(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await resetOutbox();
});

describe('useClearCheckedItems', () => {
  it('removes only the checked items assigned to the store', async () => {
    const client = makeGroceriesClient();
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, [
      item('bought', 'store-1', true), // cleared
      item('still-needed', 'store-1', false), // kept — not crossed off
      item('other-store', 'store-2', true), // kept — different store
      item('no-store', '', true), // kept — No Store group
    ]);
    vi.mocked(aepbase.remove).mockResolvedValue(undefined);

    const { result } = render(client);

    let cleared: GroceryItem[] = [];
    act(() => {
      cleared = result.current('store-1');
    });

    expect(cleared.map((i) => i.id)).toEqual(['bought']);
    await waitFor(() =>
      expect(aepbase.remove).toHaveBeenCalledWith('groceries', 'bought', {
        force: true,
      }),
    );
    expect(aepbase.remove).toHaveBeenCalledTimes(1);

    const remaining = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    expect(remaining.map((i) => i.id).sort()).toEqual([
      'no-store',
      'other-store',
      'still-needed',
    ]);
  });

  it('treats null as the No Store group', async () => {
    const client = makeGroceriesClient();
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, [
      item('no-store-done', '', true), // cleared
      item('no-store-open', '', false), // kept
      item('in-store-done', 'store-1', true), // kept
    ]);
    vi.mocked(aepbase.remove).mockResolvedValue(undefined);

    const { result } = render(client);

    let cleared: GroceryItem[] = [];
    act(() => {
      cleared = result.current(null);
    });

    expect(cleared.map((i) => i.id)).toEqual(['no-store-done']);
    await waitFor(() => expect(aepbase.remove).toHaveBeenCalledTimes(1));
    const remaining = client.getQueryData<GroceryItem[]>(ITEMS_KEY) ?? [];
    expect(remaining.map((i) => i.id).sort()).toEqual([
      'in-store-done',
      'no-store-open',
    ]);
  });

  it('is a no-op when nothing in the store is checked', () => {
    const client = makeGroceriesClient();
    client.setQueryData<GroceryItem[]>(ITEMS_KEY, [item('open', 'store-1', false)]);

    const { result } = render(client);

    let cleared: GroceryItem[] = [];
    act(() => {
      cleared = result.current('store-1');
    });

    expect(cleared).toEqual([]);
    expect(aepbase.remove).not.toHaveBeenCalled();
    expect(client.getQueryData<GroceryItem[]>(ITEMS_KEY)).toHaveLength(1);
  });
});
