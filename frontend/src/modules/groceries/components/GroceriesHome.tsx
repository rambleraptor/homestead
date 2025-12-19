/**
 * Groceries Home Component
 *
 * Main grocery list interface
 */

import { useState } from 'react';
import { Plus, ShoppingCart, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useGroupedGroceries } from '../hooks/useGroupedGroceries';
import { useCreateGroceryItem } from '../hooks/useCreateGroceryItem';
import { useUpdateGroceryItem } from '../hooks/useUpdateGroceryItem';
import { useDeleteGroceryItem } from '../hooks/useDeleteGroceryItem';
import { GroceryList } from './GroceryList';
import { GroceryItemForm } from './GroceryItemForm';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { logger } from '@/core/utils/logger';
import type { GroceryItemFormData } from '../types';

export function GroceriesHome() {
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const { stats, isLoading, isError, error } = useGroupedGroceries();
  const createMutation = useCreateGroceryItem();
  const updateMutation = useUpdateGroceryItem();
  const deleteMutation = useDeleteGroceryItem();

  const handleAddItem = () => {
    setShowForm(true);
  };

  const handleFormSubmit = async (data: GroceryItemFormData) => {
    try {
      await createMutation.mutateAsync(data);
      setShowForm(false);
    } catch (err) {
      logger.error('Failed to create grocery item', err);
    }
  };

  const handleToggleItem = async (id: string, checked: boolean) => {
    try {
      await updateMutation.mutateAsync({ id, data: { checked } });
    } catch (err) {
      logger.error('Failed to toggle grocery item', err);
    }
  };

  const handleDeleteItem = (id: string) => {
    setItemToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (itemToDelete) {
      await deleteMutation.mutateAsync(itemToDelete);
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
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
  const isUpdating = updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
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

        {!showForm && (
          <button
            onClick={handleAddItem}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
            data-testid="add-grocery-item-button"
          >
            <Plus className="w-5 h-5" />
            Add Item
          </button>
        )}
      </div>

      {/* Add Item Form */}
      {showForm && (
        <GroceryItemForm
          onSubmit={handleFormSubmit}
          onCancel={() => setShowForm(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Grocery List */}
      <GroceryList
        groups={stats.categories}
        onToggleItem={handleToggleItem}
        onDeleteItem={handleDeleteItem}
        isUpdating={isUpdating}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Item"
        message="Are you sure you want to delete this grocery item? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
}
