/**
 * Grocery List Component
 *
 * Displays grocery items grouped by store
 */

import { Check, Trash2, Store as StoreIcon, Eraser, ShoppingCart } from 'lucide-react';
import { usePendingSyncIds } from '@rambleraptor/homestead-core/api/usePendingSync';
import {
  useRecentRemoteChanges,
  type RemoteChange,
} from '@rambleraptor/homestead-core/api/remoteChanges';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import { SwipeRow } from '@rambleraptor/homestead-core/shared/gestures';
import {
  PendingSyncBadge,
  pendingSyncClass,
} from '@rambleraptor/homestead-core/shared/components/PendingSyncBadge';
import {
  RemoteChangeBadge,
  remoteChangeClass,
} from '@rambleraptor/homestead-core/shared/components/RemoteChange';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import type { StoreGroupedGroceries, GroceryItem } from '../types';

interface GroceryListProps {
  storeGroups: StoreGroupedGroceries[];
  onToggleItem: (id: string, checked: boolean) => void;
  onDeleteItem: (id: string) => void;
  /** Remove every crossed-off item in the store (`null` = the No Store group). */
  onClearCheckedItems?: (storeId: string | null) => void;
}

export function GroceryList({
  storeGroups,
  onToggleItem,
  onDeleteItem,
  onClearCheckedItems,
}: GroceryListProps) {
  // Subscribed once for the whole list rather than per row — this is the view
  // most likely to be open on a phone with no signal, and it can hold a lot of
  // rows.
  const pendingSyncIds = usePendingSyncIds();
  const recentChanges = useRecentRemoteChanges('grocery');

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
            {/* Only offered once there is something crossed off to sweep away —
                an always-present button that does nothing invites a mis-tap. */}
            {onClearCheckedItems && storeGroup.checkedCount > 0 && (
              <button
                onClick={() => onClearCheckedItems(storeGroup.store?.id || null)}
                data-testid="clear-checked-items-button"
                title="Remove crossed-off items from this store"
                className="ml-1 flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200 text-sm whitespace-nowrap"
              >
                <Eraser className="w-4 h-4" />
                <span className="hidden sm:inline">Clear crossed off</span>
                <span className="sm:hidden">Clear</span>
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
                  isPendingSync={pendingSyncIds.has(item.id)}
                  remoteChange={recentChanges.get(item.id)}
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
  /** Write for this item is queued for reconnect. */
  isPendingSync?: boolean;
  /** Someone else just changed this item. */
  remoteChange?: RemoteChange;
}

function GroceryItemRow({
  item,
  onToggle,
  onDelete,
  disabled = false,
  isPendingSync = false,
  remoteChange,
}: GroceryItemRowProps) {
  return (
    // Swipe mirrors the two controls already on the row — it never offers an
    // action the checkbox and the bin button don't. Right to tick off, left to
    // remove, matching the direction convention every mail app on the phone
    // already taught the household.
    <SwipeRow
      disabled={disabled}
      swipeRight={{
        label: item.checked ? 'Uncheck' : 'Check off',
        icon: Check,
        className: 'bg-green-500 text-white',
        onAction: () => onToggle(item.id, !item.checked),
      }}
      swipeLeft={{
        label: 'Delete',
        icon: Trash2,
        className: 'bg-red-600 text-white',
        onAction: () => onDelete(item.id),
      }}
      className="bg-white"
    >
      <div
        className={cn(
          'px-4 py-3 flex items-center gap-3 hover:bg-bg-pearl group transition-colors',
          pendingSyncClass(isPendingSync),
          remoteChangeClass(remoteChange),
        )}
        data-testid="grocery-item"
        data-remote-change={remoteChange ? true : undefined}
        data-pending-sync={isPendingSync || undefined}
      >
        <Checkbox
          checked={item.checked}
          onCheckedChange={(checked) => onToggle(item.id, checked)}
          disabled={disabled}
          className="h-5 w-5"
          aria-label={`Mark ${item.name} as ${item.checked ? 'unchecked' : 'checked'}`}
        />

        <div className="flex-1 min-w-0">
          <p
            className={`flex flex-wrap items-center gap-x-2 font-body font-medium ${
              item.checked
                ? 'line-through text-text-muted'
                : 'text-brand-navy'
            }`}
          >
            {/* Full name always shown — a shopper needs the whole item, so it
                wraps onto as many lines as it takes instead of truncating. */}
            <span className="break-words min-w-0">{item.name}</span>
            {isPendingSync && <PendingSyncBadge className="no-underline" />}
            <RemoteChangeBadge change={remoteChange} className="no-underline" />
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
    </SwipeRow>
  );
}
