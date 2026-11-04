/**
 * Grocery Item Form Component
 *
 * Add-item form. State, validation, and submission run through the shared
 * `useSchemaForm` engine.
 * The store select stays a native `<select>` over the stores collection (not a
 * combobox), and the default store is still pre-selected from the household
 * `default_store` flag. Submit stays disabled until a name is entered.
 */

import { useMemo } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { useSchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import { useStores } from '../hooks/useStores';
import { useAppFlag } from '@rambleraptor/homestead-core/settings';
import { groceriesResources } from '../resources';
import type { GroceryItemFormData } from '../types';

const groceryDef = groceriesResources.find((r) => r.singular === 'grocery')!;

interface GroceryItemFormProps {
  onSubmit: (data: GroceryItemFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function GroceryItemForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: GroceryItemFormProps) {
  const { data: stores = [] } = useStores();
  const { value: defaultStore = '' } = useAppFlag<string>('groceries', 'default_store');
  const initialStore = useMemo(
    () => (defaultStore && stores.some((s) => s.id === defaultStore) ? defaultStore : ''),
    [defaultStore, stores],
  );

  const form = useSchemaForm<GroceryItemFormData>({
    resource: groceryDef,
    initialData: { name: '', notes: '', store: initialStore },
    onSubmit,
    fields: { name: { id: 'name' }, notes: { id: 'notes' }, store: { id: 'store' } },
    // Send name/notes/store exactly as the form holds them — an explicit empty
    // store means "No Store" (don't let the omit-blank default reach for the flag).
    buildPayload: (v) => ({
      name: v.name as string,
      notes: v.notes as string,
      store: v.store as string,
    }),
  });

  const busy = isSubmitting || form.isSubmitting;

  return (
    <form onSubmit={form.handleSubmit} className="bg-surface-white rounded-2xl border border-gray-100 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-brand-navy">Add Grocery Item</h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 hover:bg-gray-100 rounded"
          aria-label="Cancel"
          data-testid="grocery-form-cancel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div>
        <label htmlFor="store" className="block text-sm font-medium text-gray-700 mb-1">
          Store
        </label>
        <select
          id="store"
          name="store"
          value={(form.values.store as string) ?? ''}
          onChange={(e) => form.setValue('store', e.target.value)}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-accent-terracotta focus:border-transparent bg-surface-white"
          disabled={busy}
          data-testid="grocery-form-store-select"
        >
          <option value="">No Store</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Item Name *
        </label>
        <input
          type="text"
          id="name"
          name="name"
          value={(form.values.name as string) ?? ''}
          onChange={(e) => form.setValue('name', e.target.value)}
          placeholder="e.g., Milk, Apples, Chicken Breast"
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-accent-terracotta focus:border-transparent"
          required
          autoFocus
          disabled={busy}
        />
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={(form.values.notes as string) ?? ''}
          onChange={(e) => form.setValue('notes', e.target.value)}
          placeholder="e.g., 2 gallons, organic only"
          rows={2}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-accent-terracotta focus:border-transparent"
          disabled={busy}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !form.isValid}
          className="flex-1 bg-accent-terracotta text-white px-3 py-2 sm:px-4 rounded-md hover:bg-accent-terracotta-hover disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
          data-testid="grocery-form-submit"
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="hidden xs:inline">Adding...</span>
              <span className="xs:hidden">Add</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span className="hidden xs:inline">Add Item</span>
              <span className="xs:hidden">Add</span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="px-3 py-2 sm:px-4 border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base shrink-0"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
