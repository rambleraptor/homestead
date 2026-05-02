'use client';

/**
 * Store Management Component
 *
 * Allows users to add, edit, and delete stores
 */

import { useState } from 'react';
import { Plus, Trash2, Loader2, Star, Store as StoreIcon, X } from 'lucide-react';
import { useStores } from '../hooks/useStores';
import { useCreateStore } from '../hooks/useCreateStore';
import { useDeleteStore } from '../hooks/useDeleteStore';
import { useModuleFlag } from '@/modules/settings';

interface StoreManagementProps {
  onClose?: () => void;
}

export function StoreManagement({ onClose }: StoreManagementProps) {
  const [storeName, setStoreName] = useState('');
  const { data: stores = [], isLoading } = useStores();
  const createMutation = useCreateStore();
  const deleteMutation = useDeleteStore();
  const {
    value: defaultStore = '',
    setValue: setDefaultStore,
    isSaving: isSavingDefault,
  } = useModuleFlag<string>('groceries', 'default_store');

  // Treat paused (offline) mutations as not-busy — the optimistic record is
  // already in the cache, so the inputs shouldn't lock up offline.
  const isCreating = createMutation.isPending && !createMutation.isPaused;
  const isDeleting = deleteMutation.isPending && !deleteMutation.isPaused;

  const handleToggleDefault = (id: string) => {
    void setDefaultStore(defaultStore === id ? '' : id);
  };

  // Fire-and-forget — optimistic updates keep the UI in sync immediately.
  // Awaiting would lock the input when offline since paused mutations never
  // resolve until the connection returns.
  const handleAddStore = () => {
    const trimmed = storeName.trim();
    if (!trimmed) return;
    createMutation.mutate({ name: trimmed, sort_order: stores.length });
    setStoreName('');
  };

  const handleDeleteStore = (id: string) => {
    if (!confirm('Are you sure you want to delete this store? Items assigned to this store will be moved to "No Store".')) {
      return;
    }
    deleteMutation.mutate(id);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddStore();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent-terracotta/10">
            <StoreIcon className="w-5 h-5 text-accent-terracotta" />
          </div>
          <h2 className="text-lg font-display font-semibold text-brand-navy">
            Manage Stores
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-brand-navy hover:bg-bg-pearl rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Add store..."
          disabled={isCreating}
          data-testid="add-store-input"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg font-body text-brand-navy placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-terracotta focus:border-transparent disabled:opacity-50 text-sm sm:text-base"
        />
        <button
          onClick={handleAddStore}
          disabled={isCreating || !storeName.trim()}
          data-testid="add-store-button"
          className="flex items-center gap-2 px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium font-body transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-accent-terracotta" />
        </div>
      ) : stores.length === 0 ? (
        <p className="text-center text-text-muted font-body py-8">
          No stores yet. Add your first store above!
        </p>
      ) : (
        <div className="space-y-2">
          {stores.map((store) => {
            const isDefault = defaultStore === store.id;
            return (
              <div
                key={store.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-bg-pearl group transition-colors"
                data-testid="store-item"
              >
                <span className="flex items-center gap-2 font-body font-medium text-brand-navy">
                  {store.name}
                  {isDefault && (
                    <span
                      className="text-xs font-normal text-accent-terracotta"
                      data-testid="default-store-label"
                    >
                      Default
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleToggleDefault(store.id)}
                    disabled={isSavingDefault}
                    aria-pressed={isDefault}
                    aria-label={
                      isDefault
                        ? `Unset ${store.name} as default store`
                        : `Set ${store.name} as default store`
                    }
                    title={isDefault ? 'Default store' : 'Set as default'}
                    data-testid="set-default-store-button"
                    className={`p-2 rounded-lg disabled:opacity-50 transition-all ${
                      isDefault
                        ? 'text-accent-terracotta'
                        : 'opacity-0 group-hover:opacity-100 text-text-muted hover:bg-bg-pearl'
                    }`}
                  >
                    <Star
                      className="w-4 h-4"
                      fill={isDefault ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button
                    onClick={() => handleDeleteStore(store.id)}
                    disabled={isDeleting}
                    className="opacity-0 group-hover:opacity-100 p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 transition-all"
                    aria-label={`Delete ${store.name}`}
                    data-testid="delete-store-button"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
