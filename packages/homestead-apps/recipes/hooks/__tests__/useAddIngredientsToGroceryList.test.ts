/**
 * Tests for the recipe → grocery-list bridge.
 *
 * The pure planner (`planGroceryAdditions`) carries the naming, notes, and
 * de-duplication rules and is exercised directly; a small integration test
 * drives the hook against a QueryClient with the grocery mutation defaults
 * registered (mirroring `providers.tsx`) to confirm it fans out one create
 * per new item and skips ones already on the list.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { registerResourceMutationDefaults } from '@rambleraptor/homestead-core/api/registerResourceMutationDefaults';
import { outbox } from '@rambleraptor/homestead-core/api/outbox';
import { GROCERIES } from '../../../groceries/resources';
import type { GroceryItem } from '../../../groceries/types';
import type { RecipeIngredient } from '../../types';
import {
  ingredientNotes,
  planGroceryAdditions,
  useAddIngredientsToGroceryList,
} from '../useAddIngredientsToGroceryList';

const ing = (partial: Partial<RecipeIngredient>): RecipeIngredient => ({
  item: '',
  qty: 0,
  unit: '',
  raw: '',
  ...partial,
});

describe('ingredientNotes', () => {
  it('joins a fractional quantity and unit', () => {
    expect(ingredientNotes(ing({ qty: 0.5, unit: 'cup' }))).toBe('1/2 cup');
  });

  it('renders whole quantities without a fraction', () => {
    expect(ingredientNotes(ing({ qty: 2, unit: 'cups' }))).toBe('2 cups');
  });

  it('omits a zero/absent quantity', () => {
    expect(ingredientNotes(ing({ qty: 0, unit: 'pinch' }))).toBe('pinch');
    expect(ingredientNotes(ing({ qty: 3, unit: '' }))).toBe('3');
    expect(ingredientNotes(ing({ qty: 0, unit: '' }))).toBe('');
  });
});

describe('planGroceryAdditions', () => {
  it('names each item after the ingredient and puts qty/unit in notes', () => {
    const { toCreate, added, skipped } = planGroceryAdditions(
      [ing({ item: 'flour', qty: 2, unit: 'cups' })],
      [],
    );
    expect(added).toBe(1);
    expect(skipped).toBe(0);
    expect(toCreate).toEqual([{ name: 'flour', notes: '2 cups' }]);
  });

  it('falls back to the raw string when item is empty, and omits blank notes', () => {
    const { toCreate } = planGroceryAdditions(
      [ing({ item: '', raw: 'a pinch of salt', qty: 0, unit: '' })],
      [],
    );
    expect(toCreate).toEqual([{ name: 'a pinch of salt' }]);
  });

  it('skips ingredients already on the list (case-insensitive)', () => {
    const { toCreate, added, skipped } = planGroceryAdditions(
      [
        ing({ item: 'Milk', qty: 1, unit: 'cup' }),
        ing({ item: 'eggs', qty: 2, unit: '' }),
      ],
      ['  milk  '],
    );
    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(toCreate).toEqual([{ name: 'eggs', notes: '2' }]);
  });

  it('de-duplicates repeated ingredients within the same batch', () => {
    const { toCreate, added, skipped } = planGroceryAdditions(
      [
        ing({ item: 'sugar', qty: 1, unit: 'cup' }),
        ing({ item: 'Sugar', qty: 2, unit: 'tbsp' }),
      ],
      [],
    );
    expect(added).toBe(1);
    expect(skipped).toBe(1);
    expect(toCreate).toEqual([{ name: 'sugar', notes: '1 cup' }]);
  });

  it('ignores blank ingredients without counting them as skipped', () => {
    const { toCreate, added, skipped } = planGroceryAdditions(
      [ing({ item: '', raw: '', qty: 0, unit: '' }), ing({ item: 'butter', qty: 1, unit: 'stick' })],
      [],
    );
    expect(added).toBe(1);
    expect(skipped).toBe(0);
    expect(toCreate).toEqual([{ name: 'butter', notes: '1 stick' }]);
  });
});

const GROCERIES_KEY = queryKeys.app('groceries').resource('grocery').list();

function createWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe('useAddIngredientsToGroceryList (integration)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await outbox.clear();
  });

  it('creates one grocery item per new ingredient and skips existing ones', async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
    registerResourceMutationDefaults(client, {
      appId: 'groceries',
      singular: 'grocery',
      plural: GROCERIES,
    });

    // One item already on the list.
    const existing: GroceryItem[] = [
      {
        id: 'g1',
        name: 'flour',
        checked: false,
        created: '2026-04-27T00:00:00Z',
        updated: '2026-04-27T00:00:00Z',
      },
    ];
    client.setQueryData<GroceryItem[]>(GROCERIES_KEY, existing);
    vi.mocked(aepbase.list).mockResolvedValue(existing);
    vi.mocked(aepbase.create).mockImplementation(async (_plural, data) => ({
      id: `srv-${(data as { name: string }).name}`,
      checked: false,
      created: '2026-04-27T00:00:01Z',
      updated: '2026-04-27T00:00:01Z',
      ...(data as object),
    }));

    const { result } = renderHook(() => useAddIngredientsToGroceryList(), {
      wrapper: createWrapper(client),
    });

    // Wait for useGroceries to hydrate from the mocked list.
    await waitFor(() => {
      expect(client.getQueryData<GroceryItem[]>(GROCERIES_KEY)).toHaveLength(1);
    });

    const outcome = result.current.addIngredients([
      ing({ item: 'flour', qty: 2, unit: 'cups' }), // already on the list
      ing({ item: 'butter', qty: 1, unit: 'stick' }),
      ing({ item: 'eggs', qty: 3, unit: '' }),
    ]);

    expect(outcome).toEqual({ added: 2, skipped: 1 });

    await waitFor(() => {
      expect(aepbase.create).toHaveBeenCalledTimes(2);
    });

    const createdPayloads = vi
      .mocked(aepbase.create)
      .mock.calls.map((call) => call[1] as Record<string, unknown>);
    expect(createdPayloads).toHaveLength(2);
    expect(createdPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'butter', notes: '1 stick' }),
        expect.objectContaining({ name: 'eggs', notes: '3' }),
      ]),
    );
  });
});
