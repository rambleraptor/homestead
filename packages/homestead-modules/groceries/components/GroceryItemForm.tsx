'use client';

/**
 * Grocery Item Form Component
 *
 * Form for adding grocery items
 */

import { useMemo, useState } from 'react';
import { Plus, X, Loader2 } from 'lucide-react';
import { useStores } from '../hooks/useStores';
import { useModuleFlag } from '@rambleraptor/homestead-core/settings';
import type { GroceryItemFormData } from '../types';

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
  const { value: defaultStore = '' } = useModuleFlag<string>(
    'groceries',
    'default_store',
  );
  const initialStore = useMemo(
    () => (defaultStore && stores.some((s) => s.id === defaultStore) ? defaultStore : ''),
    [defaultStore, stores],
  );
  const [formData, setFormData] = useState<GroceryItemFormData>({
    name: '',
    notes: '',
    store: initialStore,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    onSubmit(formData);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Add Grocery Item</h3>
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
          value={formData.store}
          onChange={handleChange}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          disabled={isSubmitting}
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
          value={formData.name}
          onChange={handleChange}
          placeholder="e.g., Milk, Apples, Chicken Breast"
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          required
          autoFocus
          disabled={isSubmitting}
        />
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          placeholder="e.g., 2 gallons, organic only"
          rows={2}
          className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isSubmitting}
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isSubmitting || !formData.name.trim()}
          className="flex-1 bg-blue-600 text-white px-3 py-2 sm:px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
          data-testid="grocery-form-submit"
        >
          {isSubmitting ? (
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
          disabled={isSubmitting}
          className="px-3 py-2 sm:px-4 border rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base shrink-0"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
