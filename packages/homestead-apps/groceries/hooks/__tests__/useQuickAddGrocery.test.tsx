/**
 * Tests for duplicate-aware quick-add.
 *
 * The pure matcher (`findExistingGrocery`) carries the naming rules and is
 * exercised directly; the hook is driven against a QueryClient with the
 * grocery mutation defaults registered (mirroring `providers.tsx`) to confirm
 * each outcome fires the right mutation — or none.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { clearTempIdMaps } from '@rambleraptor/homestead-core/api/registerResourceMutationDefaults';
import { makeGroceriesClient } from './testUtils';
import type { GroceryItem } from '../../types';
import { findExistingGrocery, useQuickAddGrocery } from '../useQuickAddGrocery';

const item = (partial: Partial<GroceryItem> & { id: string; name: string }): GroceryItem => ({
  checked: false,
  created: '2026-09-19T00:00:00Z',
  updated: '2026-09-19T00:00:00Z',
  ...partial,
});

describe('findExistingGrocery', () => {
  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const items = [item({ id: 'g1', name: 'Milk' })];
    expect(findExistingGrocery(items, '  milk ')).toBe(items[0]);
    expect(findExistingGrocery(items, 'MILK')).toBe(items[0]);
  });

  it('returns undefined when nothing matches or the name is blank', () => {
    const items = [item({ id: 'g1', name: 'Milk' })];
    expect(findExistingGrocery(items, 'Bread')).toBeUndefined();
    expect(findExistingGrocery(items, 'Milk 2%')).toBeUndefined();
    expect(findExistingGrocery(items, '   ')).toBeUndefined();
  });

  it('prefers an outstanding copy over a crossed-off one', () => {
    const items = [
      item({ id: 'done', name: 'milk', checked: true }),
      item({ id: 'open', name: 'Milk' }),
    ];
    expect(findExistingGrocery(items, 'milk')?.id).toBe('open');
  });

  it('falls back to a crossed-off copy when that is all there is', () => {
    const items = [item({ id: 'done', name: 'milk', checked: true })];
    expect(findExistingGrocery(items, 'Milk')?.id).toBe('done');
  });
});

const GROCERIES_KEY = queryKeys.app('groceries').resource('grocery').list();

function createWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

async function renderQuickAdd(existing: GroceryItem[]) {
  const client = makeGroceriesClient();
  client.setQueryData<GroceryItem[]>(GROCERIES_KEY, existing);
  vi.mocked(aepbase.list).mockResolvedValue(existing);
  vi.mocked(aepbase.create).mockImplementation(async (_plural, data) => ({
    id: `srv-${(data as { name: string }).name}`,
    checked: false,
    created: '2026-09-19T00:00:01Z',
    updated: '2026-09-19T00:00:01Z',
    ...(data as object),
  }));
  vi.mocked(aepbase.update).mockImplementation(async (_plural, id, data) => ({
    ...existing.find((g) => g.id === id),
    ...(data as object),
  }));

  const rendered = renderHook(() => useQuickAddGrocery(), {
    wrapper: createWrapper(client),
  });
  // Wait for useGroceries to hydrate from the mocked list.
  await waitFor(() => {
    expect(client.getQueryData<GroceryItem[]>(GROCERIES_KEY)).toHaveLength(existing.length);
  });
  return { ...rendered, client };
}

describe('useQuickAddGrocery (integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTempIdMaps();
  });

  it('creates a new item when the name is not on the list', async () => {
    const { result } = await renderQuickAdd([item({ id: 'g1', name: 'Milk' })]);

    const outcome = result.current.quickAdd('  Bread ', 'store-1');

    expect(outcome).toEqual({ kind: 'created' });
    await waitFor(() => {
      expect(aepbase.create).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(aepbase.create).mock.calls[0][1]).toEqual(
      expect.objectContaining({ name: 'Bread', store: 'store-1' }),
    );
    expect(aepbase.update).not.toHaveBeenCalled();
  });

  it('adds nothing when an outstanding copy is already listed', async () => {
    const existing = item({ id: 'g1', name: 'Milk', store: 'store-1' });
    const { result, client } = await renderQuickAdd([existing]);

    const outcome = result.current.quickAdd('milk', 'store-2');

    expect(outcome).toEqual({ kind: 'already-listed', item: existing });
    expect(aepbase.create).not.toHaveBeenCalled();
    expect(aepbase.update).not.toHaveBeenCalled();
    expect(client.getQueryData<GroceryItem[]>(GROCERIES_KEY)).toHaveLength(1);
  });

  it('unchecks a crossed-off copy instead of adding a second row', async () => {
    const existing = item({ id: 'g1', name: 'Milk', checked: true });
    const { result } = await renderQuickAdd([existing]);

    const outcome = result.current.quickAdd('MILK');

    expect(outcome).toEqual({ kind: 'unchecked', item: existing });
    await waitFor(() => {
      expect(aepbase.update).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(aepbase.update).mock.calls[0].slice(1, 3)).toEqual([
      'g1',
      expect.objectContaining({ checked: false }),
    ]);
    expect(aepbase.create).not.toHaveBeenCalled();
  });
});
