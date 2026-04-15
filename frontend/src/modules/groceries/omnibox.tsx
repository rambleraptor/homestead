'use client';

/**
 * Groceries module — omnibox adapter.
 *
 * List-view reuses `GroceriesHome`. The add-item form is a small inline
 * component (no separate `<QuickAdd />` yet — the main module's own
 * quick-add stays inside `GroceriesHome`). Submitting calls the shared
 * `useCreateGroceryItem` mutation, so behaviour is identical to the
 * normal quick-add.
 */

import React, { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/shared/components/Button';
import { Input } from '@/shared/components/Input';
import type { OmniboxAdapter } from '@/shared/omnibox/types';
import type { GroceryItemFormData } from './types';
import { GroceriesList } from './components/GroceriesList';
import { useCreateGroceryItem } from './hooks/useCreateGroceryItem';
import { useStores } from './hooks/useStores';

const createGroceryItemParamSchema = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  // Store name (not id) as the LLM sees it; we resolve to id below.
  store: z.string().optional(),
});

interface AddGroceryFormProps {
  initialValues: Partial<GroceryItemFormData>;
  onSubmit: (values: GroceryItemFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

function AddGroceryForm({
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting,
}: AddGroceryFormProps) {
  const { data: stores = [] } = useStores();
  const [name, setName] = useState(initialValues.name ?? '');
  const [notes, setNotes] = useState(initialValues.notes ?? '');

  // If the LLM supplied a store by name, try to resolve to an id.
  const initialStoreId =
    stores.find(
      (s) =>
        typeof initialValues.store === 'string' &&
        s.name.toLowerCase() === initialValues.store.toLowerCase(),
    )?.id ??
    (typeof initialValues.store === 'string' ? initialValues.store : '');
  const [storeId, setStoreId] = useState(initialStoreId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({
      name: trimmed,
      notes: notes.trim() || undefined,
      store: storeId || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Item
        </label>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. milk"
          disabled={isSubmitting}
          data-testid="omnibox-grocery-name"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Store
        </label>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          disabled={isSubmitting}
          className="w-full px-3 py-2 border rounded-md bg-white disabled:opacity-50 text-sm"
          data-testid="omnibox-grocery-store"
        >
          <option value="">No store</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="optional"
          disabled={isSubmitting}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          data-testid="omnibox-grocery-submit"
        >
          {isSubmitting ? 'Adding…' : 'Add item'}
        </Button>
      </div>
    </form>
  );
}

export const groceriesOmnibox: OmniboxAdapter = {
  synonyms: [
    'groceries',
    'grocery',
    'shopping',
    'list',
    'food',
    'produce',
    'supermarket',
  ],
  filters: [],
  listComponent: GroceriesList,
  forms: [
    {
      id: 'add-grocery-item',
      label: 'Add grocery item',
      description: 'Add an item to the grocery shopping list.',
      paramSchema: createGroceryItemParamSchema,
      useMutation: () => {
        const m = useCreateGroceryItem();
        return {
          mutateAsync: (values) =>
            m.mutateAsync(values as unknown as GroceryItemFormData),
          isPending: m.isPending,
        };
      },
      render: ({ initialValues, onSubmit, onCancel, isSubmitting }) => (
        <AddGroceryForm
          initialValues={initialValues as Partial<GroceryItemFormData>}
          onSubmit={(values) =>
            onSubmit(values as unknown as Record<string, unknown>)
          }
          onCancel={onCancel}
          isSubmitting={isSubmitting}
        />
      ),
      successMessage: (values) =>
        `Added ${typeof values.name === 'string' ? values.name : 'item'} to groceries`,
    },
  ],
};
