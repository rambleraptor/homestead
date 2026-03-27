'use client';

/**
 * Grocery List Component
 *
 * Displays grocery items grouped by store
 */

import { Trash2, Store as StoreIcon, CheckCheck } from 'lucide-react';
import type { StoreGroupedGroceries, GroceryItem } from '../types';

interface GroceryListProps {
  storeGroups: StoreGroupedGroceries[];
  onToggleItem: (id: string, checked: boolean) => void;
  onDeleteItem: (id: string) => void;
  onMarkStoreCompleted?: (storeId: string | null) => void;
  isUpdating?: boolean;
}

export function GroceryList({
  storeGroups,
  onToggleItem,
  onDeleteItem,
  onMarkStoreCompleted,
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
            <span className="text-sm text-gray-600 shrink-0 whitespace-nowrap">
              {storeGroup.checkedCount} / {storeGroup.totalCount} checked
            </span>
            {onMarkStoreCompleted && storeGroup.totalCount > 0 && (
              <button
                onClick={() => onMarkStoreCompleted(storeGroup.store?.id || null)}
                disabled={isUpdating}
                className="ml-2 bg-green-600 text-white px-2 py-1 sm:px-3 sm:py-1.5 rounded-md hover:bg-green-700 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm whitespace-nowrap"
                data-testid="mark-store-completed-button"
                title="Clear all items from this store"
              >
                <CheckCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Mark Complete</span>
                <span className="sm:hidden">Done</span>
              </button>
            )}
          </div>

          {/* Items within this store */}
          <div className="bg-white rounded-lg border">
            <div className="divide-y">
              {storeGroup.items.map((item) => (
                <GroceryItemRow
                  key={item.id}
                  item={item}
                  onToggle={onToggleItem}
                  onDelete={onDeleteItem}
                />
              ))}
            </div>
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
        className="p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
        aria-label={`Delete ${item.name}`}
        data-testid="delete-grocery-item"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
