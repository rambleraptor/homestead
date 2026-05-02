'use client';

/**
 * Credit Cards List Component
 *
 * Data-backed wrapper around `CardList` that owns its own fetching, archived
 * toggle, edit modal, and delete confirmation. Used by `CreditCardsHome`
 * and by the omnibox list view — it deliberately omits the page header,
 * dashboard KPIs, upcoming perks, and the "Add Card" button so the omnibox
 * doesn't render chrome that belongs to the module's full home page.
 */

import { useState } from 'react';
import { Loader2, AlertCircle, CreditCard as CreditCardIcon } from 'lucide-react';
import { useCreditCards } from '../hooks/useCreditCards';
import { useCreditCardPerks } from '../hooks/useCreditCardPerks';
import { usePerkRedemptions } from '../hooks/usePerkRedemptions';
import { useUpdateCreditCard } from '../hooks/useUpdateCreditCard';
import { useDeleteCreditCard } from '../hooks/useDeleteCreditCard';
import { CardList } from './CardList';
import { CreditCardForm } from './CreditCardForm';
import { Modal } from '@/shared/components/Modal';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { CreditCard as CreditCardType, CreditCardFormData } from '../types';

export function CreditCardsList() {
  const [editingCard, setEditingCard] = useState<CreditCardType | null>(null);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: cards, isLoading, isError, error } = useCreditCards();
  const { data: perks } = useCreditCardPerks();
  const { data: redemptions } = usePerkRedemptions();

  const updateCardMutation = useUpdateCreditCard();
  const deleteCardMutation = useDeleteCreditCard();

  const handleUpdateCard = async (data: CreditCardFormData) => {
    if (!editingCard) return;
    try {
      await updateCardMutation.mutateAsync({ id: editingCard.id, data });
      setEditingCard(null);
    } catch (err) {
      logger.error('Failed to update credit card', err);
    }
  };

  const handleConfirmDelete = async () => {
    if (!cardToDelete) return;
    try {
      await deleteCardMutation.mutateAsync(cardToDelete);
    } catch (err) {
      logger.error('Failed to delete credit card', err);
    } finally {
      setCardToDelete(null);
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
            <h3 className="font-semibold text-red-900">Failed to load credit cards</h3>
            <p className="text-sm text-red-700">
              {error instanceof Error ? error.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeCards = cards?.filter((c) => !c.archived) ?? [];
  const archivedCards = cards?.filter((c) => c.archived) ?? [];

  return (
    <>
      <CardList
        cards={activeCards}
        perks={perks ?? []}
        redemptions={redemptions ?? []}
        onSelectCard={() => { /* no-op; use edit/delete per card */ }}
        onEditCard={(card) => setEditingCard(card)}
        onDeleteCard={(id) => setCardToDelete(id)}
      />

      {archivedCards.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            {showArchived ? 'Hide' : 'Show'} archived cards ({archivedCards.length})
          </button>
          {showArchived && (
            <div className="mt-3">
              <CardList
                cards={archivedCards}
                perks={perks ?? []}
                redemptions={redemptions ?? []}
                onSelectCard={() => { /* no-op */ }}
                onEditCard={(card) => setEditingCard(card)}
                onDeleteCard={(id) => setCardToDelete(id)}
              />
            </div>
          )}
        </div>
      )}

      {activeCards.length === 0 && archivedCards.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <CreditCardIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No credit cards yet. Add your first card to start tracking perks.</p>
        </div>
      )}

      <Modal
        isOpen={!!editingCard}
        onClose={() => setEditingCard(null)}
        title="Edit Credit Card"
      >
        {editingCard && (
          <CreditCardForm
            initialData={editingCard}
            onSubmit={handleUpdateCard}
            onCancel={() => setEditingCard(null)}
            isSubmitting={updateCardMutation.isPending}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={cardToDelete !== null}
        onClose={() => setCardToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Card"
        message="Are you sure you want to delete this card? All perks and redemptions for this card will also be deleted."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteCardMutation.isPending}
      />
    </>
  );
}
