'use client';

/**
 * Groceries Home Component
 *
 * Main grocery list interface
 */

import { useState, useRef } from 'react';
import { Plus, Loader2, CheckCircle2, Image as ImageIcon, ListRestart, Store as StoreIcon, Bell } from 'lucide-react';
import { useGroupedGroceries } from '../hooks/useGroupedGroceries';
import { useStores } from '../hooks/useStores';
import { useCreateGroceryItem } from '../hooks/useCreateGroceryItem';
import { useDeleteAllGroceries } from '../hooks/useDeleteAllGroceries';
import { GroceriesList } from './GroceriesList';
import { ImageUploadDialog } from './ImageUploadDialog';
import { StoreManagement } from './StoreManagement';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { useSendGroceryNotification } from '../hooks/useSendGroceryNotification';
import { logger } from '@/core/utils/logger';

export function GroceriesHome() {
  const [itemName, setItemName] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showStoreManagement, setShowStoreManagement] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { stats } = useGroupedGroceries();
  const { data: stores = [] } = useStores();
  const createMutation = useCreateGroceryItem();
  const deleteAllMutation = useDeleteAllGroceries();
  const notifyMutation = useSendGroceryNotification();

  const handleQuickAdd = async () => {
    if (!itemName.trim()) return;

    try {
      await createMutation.mutateAsync({
        name: itemName.trim(),
        store: selectedStore || undefined,
      });
      setItemName('');
      inputRef.current?.focus();
    } catch (err) {
      logger.error('Failed to create grocery item', err);
    }
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
      logger.error('Failed to delete all grocery items', err);
    }
  };

  const handleNotify = async () => {
    try {
      await notifyMutation.mutateAsync();
    } catch (err) {
      logger.error('Failed to send grocery notification', err);
    }
  };

  const isSubmitting = createMutation.isPending;
  const isBulkUpdating = deleteAllMutation.isPending;

  const subtitle =
    stats.totalItems > 0 ? (
      <span className="inline-flex items-center gap-2">
        {stats.checkedItems} / {stats.totalItems} items checked
        {stats.checkedItems === stats.totalItems && (
          <CheckCircle2 className="w-4 h-4 text-green-600" />
        )}
      </span>
    ) : (
      'Plan and track items across your stores.'
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grocery List"
        subtitle={subtitle}
        actions={
          <>
            <button
              onClick={() => setShowStoreManagement(!showStoreManagement)}
              data-testid="manage-stores-button"
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200"
            >
              <StoreIcon className="w-5 h-5" />
              Stores
            </button>
            <button
              onClick={handleNotify}
              disabled={notifyMutation.isPending}
              data-testid="notify-grocery-button"
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {notifyMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Bell className="w-5 h-5" />
              )}
              {notifyMutation.isPending ? 'Sending...' : 'Notify'}
            </button>
            <button
              onClick={() => setShowImageUpload(true)}
              disabled={isBulkUpdating}
              data-testid="upload-grocery-list-button"
              className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-bg-pearl text-brand-navy rounded-lg font-medium font-body transition-colors shadow-sm border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ImageIcon className="w-5 h-5" aria-hidden="true" />
              Upload List
            </button>
            {stats.totalItems > 0 && (
              <button
                onClick={handleNewList}
                disabled={isBulkUpdating}
                data-testid="new-grocery-list-button"
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium font-body transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ListRestart className="w-5 h-5" />
                New List
              </button>
            )}
          </>
        }
      />

      {showStoreManagement && <StoreManagement />}

      <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
        <div className="flex gap-2">
          <select
            value={selectedStore}
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
            className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Add</span>
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
