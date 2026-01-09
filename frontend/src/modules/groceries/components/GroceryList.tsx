'use client';

/**
 * Grocery List Component
 *
 * Displays grocery items grouped by store and category
 */

import { Trash2, Store as StoreIcon } from 'lucide-react';
import type { StoreGroupedGroceries, GroceryItem } from '../types';

interface GroceryListProps {
  storeGroups: StoreGroupedGroceries[];
  onToggleItem: (id: string, checked: boolean) => void;
  onDeleteItem: (id: string) => void;
  isUpdating?: boolean;
}

export function GroceryList({
  storeGroups,
  onToggleItem,
  onDeleteItem,
  isUpdating = false,
}: GroceryListProps) {
  if (storeGroups.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No items in your grocery list.</p>
        <p className="text-sm mt-2">Add your first item to get started!</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {storeGroups.map((storeGroup) => (
        <div key={storeGroup.store?.id || 'no-store'} className="space-y-4">
          {/* Store header */}
          <div className="flex items-center gap-2 px-2">
            <StoreIcon className="w-5 h-5 text-gray-600 shrink-0" />
            <h2 className="text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
              {storeGroup.store?.name || 'No Store'}
            </h2>
            <span className="ml-auto text-sm text-gray-600 shrink-0 whitespace-nowrap">
              {storeGroup.checkedCount} / {storeGroup.totalCount} checked
            </span>
          </div>

          {/* Categories within this store */}
          <div className="space-y-4">
            {storeGroup.categories.map((group) => (
              <div key={group.category} className="bg-white rounded-lg border">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 flex-1 min-w-0 truncate">{group.category}</h3>
                    <span className="text-sm text-gray-600 shrink-0 whitespace-nowrap">
                      {group.checkedCount} / {group.totalCount} checked
                    </span>
                  </div>
                </div>

                <div className="divide-y">
                  {group.items.map((item) => (
                    <GroceryItemRow
                      key={item.id}
                      item={item}
                      onToggle={onToggleItem}
                      onDelete={onDeleteItem}
                      disabled={isUpdating}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface GroceryItemRowProps {
  item: GroceryItem;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

function GroceryItemRow({ item, onToggle, onDelete, disabled = false }: GroceryItemRowProps) {
  return (
    <div
      className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 group"
      data-testid="grocery-item"
    >
      <input
        type="checkbox"
        checked={item.checked}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        disabled={disabled}
        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
        aria-label={`Mark ${item.name} as ${item.checked ? 'unchecked' : 'checked'}`}
      />

      <div className="flex-1 min-w-0">
        <p
          className={`font-medium ${
            item.checked ? 'line-through text-gray-500' : 'text-gray-900'
          }`}
        >
          {item.name}
        </p>
        {item.notes && (
          <p className="text-sm text-gray-600 mt-0.5">{item.notes}</p>
        )}
      </div>

      <button
        onClick={() => onDelete(item.id)}
        disabled={disabled}
        className="opacity-0 group-hover:opacity-100 p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 transition-opacity"
        aria-label={`Delete ${item.name}`}
        data-testid="delete-grocery-item"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
