'use client';

/**
 * Store Management Component
 *
 * Allows users to add, edit, and delete stores
 */

import { useState } from 'react';
import { Plus, Trash2, Loader2, Store as StoreIcon } from 'lucide-react';
import { useStores } from '../hooks/useStores';
import { useCreateStore } from '../hooks/useCreateStore';
import { useDeleteStore } from '../hooks/useDeleteStore';
import { logger } from '@/core/utils/logger';

interface StoreManagementProps {
  onClose?: () => void;
}

export function StoreManagement({ onClose }: StoreManagementProps) {
  const [storeName, setStoreName] = useState('');
  const { data: stores = [], isLoading } = useStores();
  const createMutation = useCreateStore();
  const deleteMutation = useDeleteStore();

  const handleAddStore = async () => {
    if (!storeName.trim()) return;

    try {
      await createMutation.mutateAsync({
        name: storeName.trim(),
        sort_order: stores.length,
      });
      setStoreName('');
    } catch (err) {
      logger.error('Failed to create store', err);
    }
  };

  const handleDeleteStore = async (id: string) => {
    if (!confirm('Are you sure you want to delete this store? Items assigned to this store will be moved to "No Store".')) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(id);
    } catch (err) {
      logger.error('Failed to delete store', err);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddStore();
    }
  };

  return (
    <div className="bg-white rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <StoreIcon className="w-6 h-6" />
          Manage Stores
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        )}
      </div>

      {/* Add Store */}
      <div className="flex gap-2">
        <input
          type="text"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Add store..."
          disabled={createMutation.isPending}
          className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          data-testid="add-store-input"
        />
        <button
          onClick={handleAddStore}
          disabled={createMutation.isPending || !storeName.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="add-store-button"
        >
          <Plus className="w-5 h-5" />
          Add
        </button>
      </div>

      {/* Store List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : stores.length === 0 ? (
        <p className="text-center text-gray-500 py-8">
          No stores yet. Add your first store above!
        </p>
      ) : (
        <div className="space-y-2">
          {stores.map((store) => (
            <div
              key={store.id}
              className="flex items-center justify-between p-3 border rounded-md hover:bg-gray-50 group"
              data-testid="store-item"
            >
              <span className="font-medium text-gray-900">{store.name}</span>
              <button
                onClick={() => handleDeleteStore(store.id)}
                disabled={deleteMutation.isPending}
                className="opacity-0 group-hover:opacity-100 p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50 transition-opacity"
                aria-label={`Delete ${store.name}`}
                data-testid="delete-store-button"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
