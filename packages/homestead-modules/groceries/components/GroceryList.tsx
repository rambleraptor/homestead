'use client';

/**
 * Grocery List Component
 *
 * Displays grocery items grouped by store
 */

import { Trash2, Store as StoreIcon, CheckCheck, ShoppingCart } from 'lucide-react';
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
      <div className="bg-white rounded-lg shadow-md p-12 border border-gray-200 text-center">
        <ShoppingCart className="w-12 h-12 text-text-muted mx-auto mb-4" />
        <p className="text-base font-body text-brand-navy font-medium">
          No items in your grocery list.
        </p>
        <p className="text-sm font-body text-text-muted mt-1">
          Add your first item to get started!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {storeGroups.map((storeGroup) => (
        <div key={storeGroup.store?.id || 'no-store'} className="space-y-3">
          <div className="flex items-center gap-3 px-1">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent-terracotta/10 shrink-0">
              <StoreIcon className="w-5 h-5 text-accent-terracotta" />
            </div>
            <h2 className="text-lg font-display font-semibold text-brand-navy flex-1 min-w-0 truncate">
              {storeGroup.store?.name || 'No Store'}
            </h2>
            <span className="text-sm font-body text-text-muted shrink-0 whitespace-nowrap">
              {storeGroup.checkedCount} / {storeGroup.totalCount} checked
            </span>
            {onMarkStoreCompleted && storeGroup.totalCount > 0 && (
              <button
                onClick={() => onMarkStoreCompleted(storeGroup.store?.id || null)}
                disabled={isUpdating}
                data-testid="mark-store-completed-button"
                title="Clear all items from this store"
                className="ml-1 flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
              >
                <CheckCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Mark Complete</span>
                <span className="sm:hidden">Done</span>
              </button>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
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
      className="px-4 py-3 flex items-center gap-3 hover:bg-bg-pearl group transition-colors"
      data-testid="grocery-item"
    >
      <input
        type="checkbox"
        checked={item.checked}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        disabled={disabled}
        className="w-5 h-5 rounded border-gray-300 text-accent-terracotta focus:ring-2 focus:ring-accent-terracotta"
        aria-label={`Mark ${item.name} as ${item.checked ? 'unchecked' : 'checked'}`}
      />

      <div className="flex-1 min-w-0">
        <p
          className={`font-body font-medium ${
            item.checked
              ? 'line-through text-text-muted'
              : 'text-brand-navy'
          }`}
        >
          {item.name}
        </p>
        {item.notes && (
          <p className="text-sm font-body text-text-muted mt-0.5">{item.notes}</p>
        )}
      </div>

      <button
        onClick={() => onDelete(item.id)}
        disabled={disabled}
        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
        aria-label={`Delete ${item.name}`}
        data-testid="delete-grocery-item"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
