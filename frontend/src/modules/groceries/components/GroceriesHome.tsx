'use client';

/**
 * Groceries Home Component
 *
 * Main grocery list interface
 */

import { useState } from 'react';
import { Plus, ShoppingCart, Loader2, AlertCircle, CheckCircle2, Image, ListRestart, Tags, Store as StoreIcon } from 'lucide-react';
import { useGroupedGroceries } from '../hooks/useGroupedGroceries';
import { useStores } from '../hooks/useStores';
import { useCreateGroceryItem } from '../hooks/useCreateGroceryItem';
import { useUpdateGroceryItem } from '../hooks/useUpdateGroceryItem';
import { useDeleteGroceryItem } from '../hooks/useDeleteGroceryItem';
import { useDeleteAllGroceries } from '../hooks/useDeleteAllGroceries';
import { useCategorizeAllGroceries } from '../hooks/useCategorizeAllGroceries';
import { GroceryList } from './GroceryList';
import { ImageUploadDialog } from './ImageUploadDialog';
import { StoreManagement } from './StoreManagement';
import { logger } from '@/core/utils/logger';

export function GroceriesHome() {
  const [itemName, setItemName] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showStoreManagement, setShowStoreManagement] = useState(false);

  const { stats, isLoading, isError, error } = useGroupedGroceries();
  const { data: stores = [] } = useStores();
  const createMutation = useCreateGroceryItem();
  const updateMutation = useUpdateGroceryItem();
  const deleteMutation = useDeleteGroceryItem();
  const deleteAllMutation = useDeleteAllGroceries();
  const categorizeAllMutation = useCategorizeAllGroceries();

  const handleQuickAdd = async () => {
    if (!itemName.trim()) return;

    try {
      await createMutation.mutateAsync({
        name: itemName.trim(),
        store: selectedStore || undefined,
      });
      setItemName('');
    } catch (err) {
      logger.error('Failed to create grocery item', err);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleQuickAdd();
    }
  };

  const handleToggleItem = async (id: string, checked: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, data: { checked } });
    } catch (err) {
      logger.error('Failed to toggle grocery item', err);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      logger.error('Failed to delete grocery item', err);
    }
  };

  const handleNewList = async () => {
    try {
      await deleteAllMutation.mutateAsync();
    } catch (err) {
      logger.error('Failed to delete all grocery items', err);
    }
  };

  const handleCategorizeAll = async () => {
    try {
      const result = await categorizeAllMutation.mutateAsync();
      logger.info(
        `Categorized ${result.categorized} of ${result.totalItems} items` +
          (result.failed > 0 ? `, ${result.failed} failed` : '')
      );
    } catch (err) {
      logger.error('Failed to categorize grocery items', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-600">Loading groceries...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-red-600">
          <AlertCircle className="w-8 h-8 mx-auto" />
          <p className="mt-2">Failed to load groceries</p>
          <p className="text-sm mt-1">{error?.message}</p>
        </div>
      </div>
    );
  }

  const isSubmitting = createMutation.isPending;
  const isUpdating = updateMutation.isPending || deleteMutation.isPending || deleteAllMutation.isPending;
  const isCategorizing = categorizeAllMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
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
            onClick={() => setShowImageUpload(true)}
            disabled={isCategorizing}
            className="bg-green-600 text-white px-3 py-2 sm:px-4 rounded-md hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            data-testid="upload-grocery-list-button"
          >
            <Image className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden xs:inline">Upload List</span>
            <span className="xs:hidden">Upload</span>
          </button>
          {stats.totalItems > 0 && (
            <>
              <button
                onClick={handleCategorizeAll}
                disabled={isCategorizing || isUpdating}
                className="bg-purple-600 text-white px-3 py-2 sm:px-4 rounded-md hover:bg-purple-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                data-testid="categorize-all-button"
              >
                {isCategorizing ? (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                ) : (
                  <Tags className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
                <span className="hidden sm:inline">{isCategorizing ? 'Categorizing...' : 'Categorize All'}</span>
                <span className="sm:hidden">{isCategorizing ? 'Categorizing...' : 'Categorize'}</span>
              </button>
              <button
                onClick={handleNewList}
                disabled={isUpdating || isCategorizing}
                className="bg-red-600 text-white px-3 py-2 sm:px-4 rounded-md hover:bg-red-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                data-testid="new-grocery-list-button"
              >
                <ListRestart className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">New List</span>
                <span className="sm:hidden">New</span>
              </button>
            </>
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
            className="px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 bg-white"
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
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Add item..."
            disabled={isSubmitting}
            className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            data-testid="quick-add-input"
            autoFocus
          />
          <button
            onClick={handleQuickAdd}
            disabled={isSubmitting || !itemName.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="quick-add-button"
          >
            <Plus className="w-5 h-5" />
            Add
          </button>
        </div>
      </div>

      {/* Grocery List */}
      <GroceryList
        storeGroups={stats.stores}
        onToggleItem={handleToggleItem}
        onDeleteItem={handleDeleteItem}
        isUpdating={isUpdating}
      />

      {/* Image Upload Dialog */}
      <ImageUploadDialog
        isOpen={showImageUpload}
        onClose={() => setShowImageUpload(false)}
      />
    </div>
  );
}
