'use client';

/**
 * Groceries List Component
 *
 * Data-backed wrapper around `GroceryList` that owns its own fetching,
 * toggle/delete wiring, and store-complete confirmation. Used by
 * `GroceriesHome` and by the omnibox list view — it deliberately omits the
 * page header, quick-add, notify, upload, new-list and store-management
 * controls so the omnibox doesn't render chrome that belongs to the
 * module's full home page.
 */

import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useGroupedGroceries } from '../hooks/useGroupedGroceries';
import { useUpdateGroceryItem } from '../hooks/useUpdateGroceryItem';
import { useDeleteGroceryItem } from '../hooks/useDeleteGroceryItem';
import { useMarkStoreCompleted } from '../hooks/useMarkStoreCompleted';
import { GroceryList } from './GroceryList';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useOnlineStatus } from '@rambleraptor/homestead-core/shared/hooks/useOnlineStatus';
import { logger } from '@rambleraptor/homestead-core/utils/logger';

export function GroceriesList() {
  const [storeToClear, setStoreToClear] = useState<{ id: string | null; name: string } | null>(null);

  const { stats, isLoading, isError, error } = useGroupedGroceries();
  const updateMutation = useUpdateGroceryItem();
  const deleteMutation = useDeleteGroceryItem();
  const markStoreCompletedMutation = useMarkStoreCompleted();
  const { isOffline } = useOnlineStatus();

  // Fire-and-forget — optimistic onMutate updates the cache synchronously,
  // so awaiting the mutation would just leak a hanging promise when the
  // mutation pauses while offline.
  const handleToggleItem = (id: string, checked: boolean) => {
    updateMutation.mutate({ id, data: { checked } });
  };

  const handleDeleteItem = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleMarkStoreCompleted = (storeId: string | null) => {
    const storeGroup = stats.stores.find((s) => (s.store?.id || null) === storeId);
    const storeName = storeGroup?.store?.name || 'No Store';
    setStoreToClear({ id: storeId, name: storeName });
  };

  const handleConfirmStoreClear = async () => {
    if (!storeToClear) return;
    try {
      const result = await markStoreCompletedMutation.mutateAsync({ storeId: storeToClear.id });
      logger.info(`Deleted ${result.deleted} items from completed store`);
      setStoreToClear(null);
    } catch (err) {
      logger.error('Failed to mark store as completed', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-accent-terracotta animate-spin" />
      </div>
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

  const isBulkUpdating = markStoreCompletedMutation.isPending;

  return (
    <>
      <GroceryList
        storeGroups={stats.stores}
        onToggleItem={handleToggleItem}
        onDeleteItem={handleDeleteItem}
        onMarkStoreCompleted={handleMarkStoreCompleted}
        // Mark Complete is a bulk delete — online-only, like New List.
        isUpdating={isBulkUpdating || isOffline}
      />

      <ConfirmDialog
        isOpen={storeToClear !== null}
        onClose={() => setStoreToClear(null)}
        onConfirm={handleConfirmStoreClear}
        title={`Clear ${storeToClear?.name ?? 'Store'}`}
        message={`Are you sure you want to clear all items from ${storeToClear?.name ?? 'this store'}? This action cannot be undone.`}
        confirmLabel="Clear Store"
        variant="danger"
        isLoading={markStoreCompletedMutation.isPending}
      />
    </>
  );
}
