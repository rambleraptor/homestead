'use client';

/**
 * Groceries Home Component
 *
 * Main grocery list interface
 */

import { useState, useRef } from 'react';
import { Plus, ShoppingCart, Loader2, CheckCircle2, Image, ListRestart, Store as StoreIcon, Bell } from 'lucide-react';
import { useGroupedGroceries } from '../hooks/useGroupedGroceries';
import { useStores } from '../hooks/useStores';
import { useCreateGroceryItem } from '../hooks/useCreateGroceryItem';
import { useDeleteAllGroceries } from '../hooks/useDeleteAllGroceries';
import { GroceriesList } from './GroceriesList';
import { ImageUploadDialog } from './ImageUploadDialog';
import { StoreManagement } from './StoreManagement';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="w-7 h-7" />
              Grocery List
            </h1>
            {stats.totalItems > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                {stats.checkedItems} / {stats.totalItems} items checked
                {stats.checkedItems === stats.totalItems && stats.totalItems > 0 && (
                  <CheckCircle2 className="w-4 h-4 inline ml-2 text-green-600" />
                )}
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons - Mobile Friendly */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowStoreManagement(!showStoreManagement)}
            className="bg-gray-600 text-white px-3 py-2 sm:px-4 rounded-md hover:bg-gray-700 flex items-center gap-2 text-sm sm:text-base"
            data-testid="manage-stores-button"
          >
            <StoreIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden xs:inline">Stores</span>
            <span className="xs:hidden">Stores</span>
          </button>
          <button
            onClick={handleNotify}
            disabled={notifyMutation.isPending}
            className="bg-blue-600 text-white px-3 py-2 sm:px-4 rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            data-testid="notify-grocery-button"
          >
            {notifyMutation.isPending ? (
              <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
            ) : (
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
            <span className="hidden xs:inline">{notifyMutation.isPending ? 'Sending...' : 'Notify'}</span>
            <span className="xs:hidden">{notifyMutation.isPending ? 'Sending...' : 'Notify'}</span>
          </button>
          <button
            onClick={() => setShowImageUpload(true)}
            disabled={isBulkUpdating}
            className="bg-green-600 text-white px-3 py-2 sm:px-4 rounded-md hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            data-testid="upload-grocery-list-button"
          >
            <Image className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            <span className="hidden xs:inline">Upload List</span>
            <span className="xs:hidden">Upload</span>
          </button>
          {stats.totalItems > 0 && (
            <button
              onClick={handleNewList}
              disabled={isBulkUpdating}
              className="bg-red-600 text-white px-3 py-2 sm:px-4 rounded-md hover:bg-red-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
              data-testid="new-grocery-list-button"
            >
              <ListRestart className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">New List</span>
              <span className="sm:hidden">New</span>
            </button>
          )}
        </div>
      </div>

      {/* Store Management */}
      {showStoreManagement && <StoreManagement />}

      {/* Quick Add Item */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex gap-2">
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            disabled={isSubmitting}
            className="px-2 py-2 sm:px-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 bg-white text-sm sm:text-base w-20 sm:w-auto"
            data-testid="store-select"
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
            className="flex-1 min-w-0 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 text-sm sm:text-base"
            data-testid="quick-add-input"
            autoFocus
          />
          <button
            onClick={handleQuickAdd}
            disabled={isSubmitting || !itemName.trim()}
            className="bg-blue-600 text-white px-3 py-2 sm:px-4 rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            data-testid="quick-add-button"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </div>

      {/* Grocery List */}
      <GroceriesList />

      {/* Image Upload Dialog */}
      <ImageUploadDialog
        isOpen={showImageUpload}
        onClose={() => setShowImageUpload(false)}
      />

      {/* Clear List Confirmation */}
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
