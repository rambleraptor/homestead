/**
 * Groceries Home Component
 *
 * Main grocery list interface
 */

import { useMemo, useState, useRef } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { useGroupedGroceries } from '../hooks/useGroupedGroceries';
import { useStores } from '../hooks/useStores';
import { useCreateGroceryItem } from '../hooks/useCreateGroceryItem';
import { useDeleteAllGroceries } from '../hooks/useDeleteAllGroceries';
import { GroceriesList } from './GroceriesList';
import { ImageUploadDialog } from './ImageUploadDialog';
import { StoreManagement } from './StoreManagement';
import { GroceriesActionsMenu } from './GroceriesActionsMenu';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { Badge } from '@rambleraptor/homestead-core/shared/components/Badge';
import { useSendGroceryNotification } from '../hooks/useSendGroceryNotification';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useOnlineStatus } from '@rambleraptor/homestead-core/shared/hooks/useOnlineStatus';
import { useAppFlag } from '@rambleraptor/homestead-core/settings';

export function GroceriesHome() {
  const [itemName, setItemName] = useState('');
  // null = follow the configured default; '' = user explicitly chose "No Store".
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showStoreManagement, setShowStoreManagement] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { stats } = useGroupedGroceries();
  const { data: stores = [] } = useStores();
  const createMutation = useCreateGroceryItem();
  const deleteAllMutation = useDeleteAllGroceries();
  const notifyMutation = useSendGroceryNotification();
  const toast = useToast();
  const { isOffline } = useOnlineStatus();
  const { value: defaultStore = '' } = useAppFlag<string>(
    'groceries',
    'default_store',
  );

  // Drop the configured default if it points at a deleted store.
  const effectiveDefault = useMemo(
    () => (defaultStore && stores.some((s) => s.id === defaultStore) ? defaultStore : ''),
    [defaultStore, stores],
  );
  const storeValue = selectedStore ?? effectiveDefault;

  const handleQuickAdd = () => {
    const trimmed = itemName.trim();
    if (!trimmed) return;

    // Fire-and-forget: optimistic onMutate puts the row in the cache
    // immediately, so we don't need to await. Awaiting would deadlock the
    // input while offline (the mutation stays paused until reconnect).
    createMutation.mutate({
      name: trimmed,
      store: storeValue || undefined,
    });
    setItemName('');
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuickAdd();
    }
  };

  const handleNewList = () => {
    setShowClearConfirm(true);
  };

  const handleConfirmNewList = async () => {
    try {
      await deleteAllMutation.mutateAsync();
      setShowClearConfirm(false);
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  // The menu closes as soon as Notify is tapped, so the result has to be
  // reported somewhere else: a toast, like every other outcome on the page.
  const handleNotify = async () => {
    try {
      await notifyMutation.mutateAsync();
      toast.success('Household notified');
    } catch (err) {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  // Treat paused (offline) mutations as not-submitting — the optimistic
  // update has already shown the new row, so the input shouldn't lock up.
  const isSubmitting = createMutation.isPending && !createMutation.isPaused;
  const isBulkUpdating = deleteAllMutation.isPending;

  const offlineBadge = isOffline ? (
    <Badge
      variant="warning"
      data-testid="groceries-offline-badge"
      aria-live="polite"
    >
      Offline — changes will sync on reconnect
    </Badge>
  ) : null;

  const subtitle =
    stats.totalItems > 0 ? (
      <span className="inline-flex items-center gap-2">
        {stats.checkedItems} / {stats.totalItems} items checked
        {stats.checkedItems === stats.totalItems && (
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        )}
        {offlineBadge}
      </span>
    ) : (
      <span className="inline-flex items-center gap-2">
        Plan and track items across your stores.
        {offlineBadge}
      </span>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grocery List"
        subtitle={subtitle}
        // One small button needs no row of its own: keep it beside the title
        // on every width instead of the header's default stack-on-mobile.
        className="flex-row items-start justify-between gap-4"
        actions={
          <GroceriesActionsMenu
            onManageStores={() => setShowStoreManagement(!showStoreManagement)}
            onNotify={handleNotify}
            onUploadList={() => setShowImageUpload(true)}
            onNewList={handleNewList}
            hasItems={stats.totalItems > 0}
            isNotifying={notifyMutation.isPending}
            isBulkUpdating={isBulkUpdating}
            isOffline={isOffline}
          />
        }
      />

      {showStoreManagement && (
        <StoreManagement onClose={() => setShowStoreManagement(false)} />
      )}

      <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
        <div className="flex gap-2">
          <select
            value={storeValue}
            onChange={(e) => setSelectedStore(e.target.value)}
            disabled={isSubmitting}
            data-testid="store-select"
            className="px-2 py-2 sm:px-3 border border-gray-200 rounded-lg font-body bg-white text-brand-navy focus:outline-none focus:ring-2 focus:ring-accent-terracotta focus:border-transparent disabled:opacity-50 text-sm sm:text-base w-20 sm:w-auto"
          >
            <option value="">No Store</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <input
            ref={inputRef}
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add item..."
            disabled={isSubmitting}
            data-testid="quick-add-input"
            autoFocus
            className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg font-body text-brand-navy placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-terracotta focus:border-transparent disabled:opacity-50 text-sm sm:text-base"
          />
          <button
            onClick={handleQuickAdd}
            disabled={isSubmitting || !itemName.trim()}
            data-testid="quick-add-button"
            aria-label="Add item"
            className="flex items-center justify-center px-3 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <GroceriesList />

      <ImageUploadDialog
        isOpen={showImageUpload}
        onClose={() => setShowImageUpload(false)}
      />

      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmNewList}
        title="Clear Grocery List"
        message="Are you sure you want to clear the entire grocery list? This action cannot be undone."
        confirmLabel="Clear List"
        variant="danger"
        isLoading={deleteAllMutation.isPending}
      />
    </div>
  );
}
