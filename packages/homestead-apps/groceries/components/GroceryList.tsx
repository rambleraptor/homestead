/**
 * Grocery List Component
 *
 * Displays grocery items grouped by store. Once the list has been sorted by
 * section (`groceries:categorize`), a store's remaining items run in section
 * order under a small heading each; a list never sorted draws no headings.
 *
 * The rows are choreographed: the ones there at first paint cascade in, a row
 * added later rises on its own, and a row deleted — one at a time, or a
 * store's crossed-off items cleared together — collapses before it goes. The
 * data moves ahead of the rows (the delete is optimistic), so the list keeps
 * drawing a leaving row from its last-known record until the collapse has
 * played (`useLeavingRows`), and a store whose every row is leaving keeps its
 * heading up until the last of them is gone rather than vanishing with the
 * first. Checking an item off is not an exit: the row stays, struck through,
 * until it is cleared.
 */

import { Fragment, useMemo, useState } from 'react';
import { Check, Trash2, Store as StoreIcon, Eraser, ShoppingCart } from 'lucide-react';
import { usePendingSyncIds } from '@rambleraptor/homestead-core/api/usePendingSync';
import {
  useRecentRemoteChanges,
  type RemoteChange,
} from '@rambleraptor/homestead-core/api/remoteChanges';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { SwipeRow } from '@rambleraptor/homestead-core/shared/gestures';
import { haptic } from '@rambleraptor/homestead-core/shared/haptics';
import {
  PendingSyncBadge,
  pendingSyncClass,
} from '@rambleraptor/homestead-core/shared/components/PendingSyncBadge';
import {
  RemoteChangeBadge,
  remoteChangeClass,
} from '@rambleraptor/homestead-core/shared/components/RemoteChange';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import {
  cascadeDelayMs,
  useLeavingRows,
  type ChoreographedRow,
} from '@rambleraptor/homestead-core/shared/hooks/useLeavingRows';
import { useStores } from '../hooks/useStores';
import { sectionOf } from '../sections';
import type { StoreGroupedGroceries, GroceryItem, Store } from '../types';

interface GroceryListProps {
  storeGroups: StoreGroupedGroceries[];
  onToggleItem: (id: string, checked: boolean) => void;
  onDeleteItem: (id: string) => void;
  /** Remove every crossed-off item in the store (`null` = the No Store group). */
  onClearCheckedItems?: (storeId: string | null) => void;
}

/** A store's rows as drawn: the live ones plus any still collapsing. */
interface DisplayGroup {
  key: string;
  store: Store | null;
  rows: ChoreographedRow<GroceryItem>[];
  checkedCount: number;
  totalCount: number;
}

/**
 * The heading each row sits under, or null for none: a remaining item's
 * section, and — only in a store that has sections — "Crossed off" for the
 * ticked items below them, so they don't read as part of the last section.
 */
function rowHeadings(rows: ChoreographedRow<GroceryItem>[]): (string | null)[] {
  const labels = rows.map(({ item }) => (item.checked ? null : (sectionOf(item.category)?.label ?? null)));
  const sectioned = labels.some((label) => label !== null);
  return rows.map(({ item }, index) => (item.checked && sectioned ? 'Crossed off' : labels[index]));
}

const groupKey = (storeId: string | null | undefined) => storeId || 'no-store';

/**
 * Regroup the choreographed rows by store. Live groups keep their order and
 * their live counts; a group that only leaving rows still belong to is
 * rebuilt from the store directory, counts from what is on screen, and sorted
 * into the place the live grouping would give it (No Store last, then
 * `sort_order`, then name) so it collapses where it stood.
 */
function regroup(
  rows: ChoreographedRow<GroceryItem>[],
  storeGroups: StoreGroupedGroceries[],
  stores: Store[],
): DisplayGroup[] {
  const groups = new Map<string, DisplayGroup>();
  for (const group of storeGroups) {
    groups.set(groupKey(group.store?.id), {
      key: groupKey(group.store?.id),
      store: group.store,
      rows: [],
      checkedCount: group.checkedCount,
      totalCount: group.totalCount,
    });
  }
  let ghostOnly = false;
  for (const row of rows) {
    const key = groupKey(row.item.store);
    let group = groups.get(key);
    if (!group) {
      const store = row.item.store ? stores.find((s) => s.id === row.item.store) : null;
      // A store deleted out from under its rows: nowhere to draw them.
      if (row.item.store && !store) continue;
      group = { key, store: store ?? null, rows: [], checkedCount: 0, totalCount: 0 };
      groups.set(key, group);
      ghostOnly = true;
    }
    group.rows.push(row);
  }
  for (const group of groups.values()) {
    if (group.totalCount === 0) {
      group.totalCount = group.rows.length;
      group.checkedCount = group.rows.filter((row) => row.item.checked).length;
    }
  }
  const list = Array.from(groups.values());
  if (!ghostOnly) return list;
  return list.sort((a, b) => {
    if (a.store === null) return 1;
    if (b.store === null) return -1;
    const order = (a.store.sort_order ?? 0) - (b.store.sort_order ?? 0);
    return order !== 0 ? order : a.store.name.localeCompare(b.store.name);
  });
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
  // Shares the cache entry the grouping was built from; costs no request.
  const { data: stores = [] } = useStores();

  // One flat choreography across every store, so a row keeps its place while
  // it leaves whichever group it is in.
  const items = useMemo(() => storeGroups.flatMap((group) => group.items), [storeGroups]);
  const { rows, leave, release } = useLeavingRows(items);
  const groups = useMemo(() => regroup(rows, storeGroups, stores), [rows, storeGroups, stores]);

  const handleToggle = (item: GroceryItem, checked: boolean) => {
    // Felt before it is seen: a tick on the phone in the shop.
    if (checked) haptic('tap');
    onToggleItem(item.id, checked);
  };

  const handleDelete = (item: GroceryItem) => {
    leave(item);
    onDeleteItem(item.id);
  };

  const handleClear = (group: DisplayGroup) => {
    for (const row of group.rows) {
      if (row.item.checked && !row.exiting) leave(row.item);
    }
    onClearCheckedItems?.(group.store?.id || null);
  };

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="No items in your grocery list."
        description="Add your first item above, or upload a photo of a paper list."
        assistantPrompt="Add milk, eggs and bread to the grocery list"
        data-testid="groceries-empty"
      />
    );
  }

  // The cascade runs down the page, across groups, so the stagger index
  // carries over from one store to the next.
  let rowIndex = 0;

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const headings = rowHeadings(group.rows);
        return (
          <div key={group.key} className="space-y-3">
            <div className="flex items-center gap-3 px-1">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent-terracotta/10 shrink-0">
                <StoreIcon className="w-5 h-5 text-accent-terracotta" />
              </div>
              <h2 className="text-lg font-display font-semibold text-brand-navy flex-1 min-w-0 truncate">
                {group.store?.name || 'No Store'}
              </h2>
              <span className="text-sm font-body text-text-muted shrink-0 whitespace-nowrap">
                {group.checkedCount} / {group.totalCount} checked
              </span>
              {/* Only offered once there is something crossed off to sweep away —
                  an always-present button that does nothing invites a mis-tap. */}
              {onClearCheckedItems && group.checkedCount > 0 && (
                <button
                  onClick={() => handleClear(group)}
                  data-testid="clear-checked-items-button"
                  title="Remove crossed-off items from this store"
                  className="ml-1 flex items-center gap-1.5 px-3 py-1.5 bg-surface-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200 text-sm whitespace-nowrap"
                >
                  <Eraser className="w-4 h-4" />
                  <span className="hidden sm:inline">Clear crossed off</span>
                  <span className="sm:hidden">Clear</span>
                </button>
              )}
            </div>

            <div className="bg-surface-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="divide-y divide-gray-100">
                {group.rows.map(({ item, exiting, firstPaint }, at) => {
                  const index = rowIndex++;
                  const heading = headings[at] !== headings[at - 1] ? headings[at] : null;
                  return (
                    <Fragment key={item.id}>
                      {heading && (
                        <h3
                          data-testid="grocery-section-heading"
                          className="px-4 py-1.5 bg-bg-pearl text-xs font-body font-semibold uppercase tracking-wide text-text-muted"
                        >
                          {heading}
                        </h3>
                      )}
                      <GroceryItemRow
                        item={item}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        isPendingSync={pendingSyncIds.has(item.id)}
                        remoteChange={recentChanges.get(item.id)}
                        enterDelayMs={firstPaint ? cascadeDelayMs(index) : 0}
                        exiting={exiting}
                        onExited={() => release(item.id)}
                      />
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface GroceryItemRowProps {
  item: GroceryItem;
  onToggle: (item: GroceryItem, checked: boolean) => void;
  onDelete: (item: GroceryItem) => void;
  disabled?: boolean;
  /** Write for this item is queued for reconnect. */
  isPendingSync?: boolean;
  /** Someone else just changed this item. */
  remoteChange?: RemoteChange;
  /** Hold the entrance back by this long; the list owns the stagger. */
  enterDelayMs?: number;
  /** Play the collapse; the list keeps the row mounted until it has. */
  exiting?: boolean;
  /** The collapse played to its end. */
  onExited?: () => void;
}

function GroceryItemRow({
  item,
  onToggle,
  onDelete,
  disabled = false,
  isPendingSync = false,
  remoteChange,
  enterDelayMs = 0,
  exiting = false,
  onExited,
}: GroceryItemRowProps) {
  // Read once, on mount: the delay belongs to the entrance, and moving it as
  // rows above leave would retime an animation that has already played.
  const [enterDelay] = useState(enterDelayMs);
  return (
    // One shell for the entrance and the exit. An exiting row is on its way to
    // being gone: out of the accessibility tree and out of reach of a tap,
    // rather than letting either land on something about to stop existing.
    <div
      className={
        exiting ? 'animate-row-collapse pointer-events-none overflow-hidden' : 'animate-field-rise'
      }
      style={exiting ? undefined : { animationDelay: `${enterDelay}ms` }}
      data-exiting={exiting || undefined}
      aria-hidden={exiting || undefined}
      onAnimationEnd={(event) => {
        // Children animate too (the remote-change flash); only the shell's own
        // collapse means the row is done.
        if (
          exiting &&
          event.target === event.currentTarget &&
          event.animationName === 'row-collapse'
        ) {
          onExited?.();
        }
      }}
    >
      {/* Swipe mirrors the two controls already on the row — it never offers an
          action the checkbox and the bin button don't. Right to tick off, left
          to remove, matching the direction convention every mail app on the
          phone already taught the household. */}
      <SwipeRow
        disabled={disabled || exiting}
        swipeRight={{
          label: item.checked ? 'Uncheck' : 'Check off',
          icon: Check,
          className: 'bg-green-500 text-white',
          onAction: () => onToggle(item, !item.checked),
        }}
        swipeLeft={{
          label: 'Delete',
          icon: Trash2,
          className: 'bg-red-600 text-white',
          onAction: () => onDelete(item),
        }}
        className="bg-surface-white"
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
            onCheckedChange={(checked) => onToggle(item, checked)}
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
            onClick={() => onDelete(item)}
            disabled={disabled}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            aria-label={`Delete ${item.name}`}
            data-testid="delete-grocery-item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </SwipeRow>
    </div>
  );
}
