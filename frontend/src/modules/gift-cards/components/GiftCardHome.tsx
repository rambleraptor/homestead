'use client';

/**
 * Gift Card Home Component
 *
 * Main gift card management interface
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Gift, Loader2, AlertCircle, Upload } from 'lucide-react';
import { useMerchantSummaries } from '../hooks/useMerchantSummaries';
import { useCreateGiftCard } from '../hooks/useCreateGiftCard';
import { useUpdateGiftCard } from '../hooks/useUpdateGiftCard';
import { useDeleteGiftCard } from '../hooks/useDeleteGiftCard';
import { MerchantList } from './MerchantList';
import { MerchantDetail } from './MerchantDetail';
import { GiftCardForm } from './GiftCardForm';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { logger } from '@/core/utils/logger';
import { formatCurrency } from '@/shared/utils/currencyUtils';
import type { GiftCard, GiftCardFormData } from '../types';

type View = 'list' | 'detail' | 'form';

export function GiftCardHome() {
  const router = useRouter();
  const [view, setView] = useState<View>('list');
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);
  const [editingCard, setEditingCard] = useState<GiftCard | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);

  const { stats, isLoading, isError, error } = useMerchantSummaries();
  const createMutation = useCreateGiftCard();
  const updateMutation = useUpdateGiftCard();
  const deleteMutation = useDeleteGiftCard();

  const handleAddCard = () => {
    setEditingCard(null);
    setView('form');
  };

  const handleMerchantClick = (merchant: string) => {
    setSelectedMerchant(merchant);
    setView('detail');
  };

  const handleBack = () => {
    setSelectedMerchant(null);
    setView('list');
  };

  const handleEditCard = (card: GiftCard) => {
    setEditingCard(card);
    setView('form');
  };

  const handleDeleteCard = (id: string) => {
    setCardToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (cardToDelete) {
      await deleteMutation.mutateAsync(cardToDelete);
      setDeleteConfirmOpen(false);
      setCardToDelete(null);
    }
  };

  const handleFormSubmit = async (data: GiftCardFormData) => {
    try {
      if (editingCard) {
        await updateMutation.mutateAsync({ id: editingCard.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
      setView('list');
      setEditingCard(null);
    } catch (err) {
      logger.error('Failed to save gift card', err);
    }
  };

  const handleFormCancel = () => {
    setView('list');
    setEditingCard(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50/20 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">
              Failed to load gift cards
            </h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const selectedMerchantData = stats?.merchants.find(
    (m) => m.merchant === selectedMerchant
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Gift Cards
              </h1>
              <p className="mt-2 text-gray-600">
                Manage your household gift cards
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => router.push('/gift-cards/import')}
                data-testid="import-gift-cards-button"
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-medium transition-colors shadow-md"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
              <button
                onClick={handleAddCard}
                data-testid="add-gift-card-button"
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-gray-900 rounded-lg font-medium transition-colors shadow-md"
              >
                <Plus className="w-5 h-5" />
                Add Gift Card
              </button>
            </div>
          </div>

          {/* Stats Overview */}
          {stats && stats.totalCards > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Total Balance
                    </p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {formatCurrency(stats.totalAmount)}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <Gift className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Total Cards
                    </p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {stats.totalCards}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Gift className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Merchants
                    </p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {stats.merchantCount}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Gift className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Merchant List */}
          {stats && (
            <MerchantList
              merchants={stats.merchants}
              onMerchantClick={handleMerchantClick}
            />
          )}
        </>
      )}

      {/* Merchant Detail View */}
      {view === 'detail' && selectedMerchantData && (
        <MerchantDetail
          merchant={selectedMerchantData.merchant}
          cards={selectedMerchantData.cards}
          totalAmount={selectedMerchantData.totalAmount}
          onBack={handleBack}
          onEdit={handleEditCard}
          onDelete={handleDeleteCard}
        />
      )}

      {/* Form View */}
      {view === 'form' && (
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            {editingCard ? 'Edit Gift Card' : 'Add New Gift Card'}
          </h2>
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <GiftCardForm
              onSubmit={handleFormSubmit}
              onCancel={handleFormCancel}
              initialData={editingCard || undefined}
              isSubmitting={createMutation.isPending || updateMutation.isPending}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Gift Card"
        message="Are you sure you want to delete this gift card? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
