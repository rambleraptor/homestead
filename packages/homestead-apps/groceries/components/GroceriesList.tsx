/**
 * Groceries List Component
 *
 * Data-backed wrapper around `GroceryList` that owns its own fetching,
 * toggle/delete wiring, and per-store clearing of crossed-off items. Used by
 * `GroceriesHome` — it deliberately omits the page header, quick-add,
 * notify, upload, new-list and store-management controls.
 */

import { AlertCircle } from 'lucide-react';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { useGroupedGroceries } from '../hooks/useGroupedGroceries';
import { useUpdateGroceryItem } from '../hooks/useUpdateGroceryItem';
import { useDeleteGroceryItem } from '../hooks/useDeleteGroceryItem';
import { useCreateGroceryItem } from '../hooks/useCreateGroceryItem';
import { useClearCheckedItems } from '../hooks/useClearCheckedItems';
import { useStoreCelebration } from '../hooks/useStoreCelebration';
import { useGroceryChangeToasts } from '../hooks/useGroceryChangeToasts';
import { GroceryList } from './GroceryList';
import { StoreConfetti } from './StoreConfetti';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';

export function GroceriesList() {
  const { stats, isLoading, isError, error } = useGroupedGroceries();
  const updateMutation = useUpdateGroceryItem();
  const deleteMutation = useDeleteGroceryItem();
  const createMutation = useCreateGroceryItem();
  const clearCheckedItems = useClearCheckedItems();
  const toast = useToast();
  useGroceryChangeToasts();
  // Checking an item that finishes off a whole store's list: the shared
  // celebration toast carries the message, the confetti overlay is the
  // fanfare. Watches the grouped stats, so the optimistic cache update fires
  // it instantly.
  const celebration = useStoreCelebration(stats.stores, (storeName) =>
    toast.celebrate(`${storeName} complete!`, {
      description: 'Every item checked off — nice work!',
    }),
  );

  // Fire-and-forget — optimistic onMutate updates the cache synchronously,
  // so awaiting the mutation would just leak a hanging promise when the
  // mutation pauses while offline.
  const handleToggleItem = (id: string, checked: boolean) => {
    updateMutation.mutate({ id, data: { checked } });
  };

  // Deleting an item used to be instant, silent, and unrecoverable — one
  // mis-tap next to the checkbox and it was simply gone, with nothing on
  // screen to say so. The toast both confirms it happened and offers the way
  // back. Undo recreates the item rather than cancelling the delete, so the
  // restored row carries a new id; nothing references a grocery item, so that
  // is invisible here (see `ToastProvider.undo` for when it wouldn't be).
  const handleDeleteItem = (id: string) => {
    const item = stats.stores
      .flatMap((group) => group.items)
      .find((candidate) => candidate.id === id);

    deleteMutation.mutate(id);

    if (!item) return;
    toast.undo(`Deleted ${item.name}`, () => {
      createMutation.mutate({
        name: item.name,
        notes: item.notes,
        store: item.store,
        checked: item.checked,
      });
    });
  };

  // Clearing a store's crossed-off items is the same delete, many times over:
  // it rides the per-item mutation (optimistic, queued offline) rather than a
  // bulk online-only call, and the undo brings back exactly the rows removed,
  // still checked, so a slip of the thumb costs nothing.
  const handleClearCheckedItems = (storeId: string | null) => {
    const cleared = clearCheckedItems(storeId);
    if (cleared.length === 0) return;

    const storeGroup = stats.stores.find((s) => (s.store?.id || null) === storeId);
    const storeName = storeGroup?.store?.name || 'No Store';
    const count = cleared.length === 1 ? '1 item' : `${cleared.length} items`;
    toast.undo(`Cleared ${count} from ${storeName}`, () => {
      for (const item of cleared) {
        createMutation.mutate({
          name: item.name,
          notes: item.notes,
          store: item.store,
          checked: item.checked,
        });
      }
    });
  };

  if (isLoading) {
    return (
      <SkeletonList
        rows={6}
        showLeading
        label="Loading groceries"
        data-testid="groceries-loading"
      />
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50/20 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Failed to load groceries</h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <GroceryList
        storeGroups={stats.stores}
        onToggleItem={handleToggleItem}
        onDeleteItem={handleDeleteItem}
        onClearCheckedItems={handleClearCheckedItems}
      />

      {celebration && <StoreConfetti key={celebration.key} />}
    </>
  );
}
