'use client';

/**
 * Credit Cards Home Component
 *
 * Main interface for tracking credit card perks and rewards
 */

import { useState } from 'react';
import { Loader2, AlertCircle, CreditCard, Plus } from 'lucide-react';
import { useCreditCards } from '../hooks/useCreditCards';
import { useCreditCardPerks } from '../hooks/useCreditCardPerks';
import { usePerkRedemptions } from '../hooks/usePerkRedemptions';
import { useCreateCreditCard } from '../hooks/useCreateCreditCard';
import { useUpdateCreditCard } from '../hooks/useUpdateCreditCard';
import { useDeleteCreditCard } from '../hooks/useDeleteCreditCard';
import { useCreatePerk } from '../hooks/useCreatePerk';
import { useUpdatePerk } from '../hooks/useUpdatePerk';
import { useDeletePerk } from '../hooks/useDeletePerk';
import { useRedeemPerk } from '../hooks/useRedeemPerk';
import { useCreateRedemption } from '../hooks/useCreateRedemption';
import { useUpdateRedemption } from '../hooks/useUpdateRedemption';
import { useDeleteRedemption } from '../hooks/useDeleteRedemption';
import { useCreditCardStats } from '../hooks/useCreditCardStats';
import { useUpcomingPerks } from '../hooks/useUpcomingPerks';
import { CreditCardDashboard } from './CreditCardDashboard';
import { CreditCardForm } from './CreditCardForm';
import { CardList } from './CardList';
import { CardDetail } from './CardDetail';
import { UpcomingPerks } from './UpcomingPerks';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { logger } from '@/core/utils/logger';
import type { CreditCardFormData, PerkFormData, RedemptionFormData, CreditCard as CreditCardType } from '../types';

type ViewState =
  | { type: 'list' }
  | { type: 'add-card' }
  | { type: 'edit-card'; card: CreditCardType }
  | { type: 'detail'; card: CreditCardType };

export function CreditCardsHome() {
  const [view, setView] = useState<ViewState>({ type: 'list' });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'card' | 'perk' | 'redemption'; id: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [now] = useState(() => Date.now());

  const { data: cards, isLoading: cardsLoading, isError: cardsError, error: cardsErrorObj } = useCreditCards();
  const { data: perks } = useCreditCardPerks();
  const { data: redemptions } = usePerkRedemptions();

  const stats = useCreditCardStats(cards ?? [], perks ?? [], redemptions ?? []);
  const upcomingPerks = useUpcomingPerks(cards ?? [], perks ?? [], redemptions ?? []);

  const createCardMutation = useCreateCreditCard();
  const updateCardMutation = useUpdateCreditCard();
  const deleteCardMutation = useDeleteCreditCard();
  const createPerkMutation = useCreatePerk();
  const updatePerkMutation = useUpdatePerk();
  const deletePerkMutation = useDeletePerk();
  const redeemPerkMutation = useRedeemPerk();
  const createRedemptionMutation = useCreateRedemption();
  const updateRedemptionMutation = useUpdateRedemption();
  const deleteRedemptionMutation = useDeleteRedemption();

  const handleCreateCard = async (data: CreditCardFormData) => {
    try {
      await createCardMutation.mutateAsync(data);
      setView({ type: 'list' });
    } catch (err) {
      logger.error('Failed to create credit card', err);
    }
  };

  const handleUpdateCard = async (id: string, data: CreditCardFormData) => {
    try {
      await updateCardMutation.mutateAsync({ id, data });
      setView({ type: 'list' });
    } catch (err) {
      logger.error('Failed to update credit card', err);
    }
  };

  const handleDeleteRequest = (type: 'card' | 'perk' | 'redemption', id: string) => {
    setItemToDelete({ type, id });
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    try {
      if (itemToDelete.type === 'card') {
        await deleteCardMutation.mutateAsync(itemToDelete.id);
        if (view.type === 'detail') setView({ type: 'list' });
      } else if (itemToDelete.type === 'perk') {
        await deletePerkMutation.mutateAsync(itemToDelete.id);
      } else {
        await deleteRedemptionMutation.mutateAsync(itemToDelete.id);
      }
    } catch (err) {
      logger.error(`Failed to delete ${itemToDelete.type}`, err);
    } finally {
      setDeleteConfirmOpen(false);
      setItemToDelete(null);
    }
  };

  const handleCreatePerk = async (data: PerkFormData) => {
    try {
      await createPerkMutation.mutateAsync(data);
    } catch (err) {
      logger.error('Failed to create perk', err);
    }
  };

  const handleUpdatePerk = async (id: string, data: PerkFormData) => {
    try {
      await updatePerkMutation.mutateAsync({ id, data });
    } catch (err) {
      logger.error('Failed to update perk', err);
    }
  };

  const handleRedeemPerk = async (perkId: string, amount: number) => {
    const perk = perks?.find((p) => p.id === perkId);
    const card = cards?.find((c) => c.id === perk?.credit_card);
    if (!perk || !card) return;

    try {
      await redeemPerkMutation.mutateAsync({
        perk,
        card,
        amount,
      });
    } catch (err) {
      logger.error('Failed to redeem perk', err);
    }
  };

  const handleCreateRedemption = async (data: RedemptionFormData) => {
    try {
      await createRedemptionMutation.mutateAsync(data);
    } catch (err) {
      logger.error('Failed to create redemption', err);
    }
  };

  const handleUpdateRedemption = async (id: string, data: RedemptionFormData) => {
    try {
      await updateRedemptionMutation.mutateAsync({ id, data });
    } catch (err) {
      logger.error('Failed to update redemption', err);
    }
  };

  if (cardsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-accent-terracotta animate-spin" />
      </div>
    );
  }

  if (cardsError) {
    return (
      <div className="bg-red-50/20 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600" />
          <div>
            <h3 className="font-semibold text-red-900">Failed to load credit cards</h3>
            <p className="text-sm text-red-700">
              {cardsErrorObj instanceof Error ? cardsErrorObj.message : 'An error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const activeCards = cards?.filter((c) => !c.archived) ?? [];
  const archivedCards = cards?.filter((c) => c.archived) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit Cards"
        subtitle="Track perks and maximize rewards"
        actions={<CreditCard className="w-8 h-8 text-accent-terracotta" />}
      />

      {/* Dashboard KPIs */}
      {stats && <CreditCardDashboard stats={stats} />}

      {/* Upcoming Perks */}
      {upcomingPerks.length > 0 && (
        <UpcomingPerks
          upcomingPerks={upcomingPerks}
          onRedeem={handleRedeemPerk}
          isRedeeming={redeemPerkMutation.isPending}
          now={now}
        />
      )}

      {/* Main content area */}
      {view.type === 'add-card' && (
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Add Credit Card</h2>
          <CreditCardForm
            onSubmit={handleCreateCard}
            onCancel={() => setView({ type: 'list' })}
            isSubmitting={createCardMutation.isPending}
          />
        </div>
      )}

      {view.type === 'edit-card' && (
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Edit Credit Card</h2>
          <CreditCardForm
            initialData={view.card}
            onSubmit={(data) => handleUpdateCard(view.card.id, data)}
            onCancel={() => setView({ type: 'list' })}
            isSubmitting={updateCardMutation.isPending}
          />
        </div>
      )}

      {view.type === 'detail' && (
        <CardDetail
          card={view.card}
          perks={perks?.filter((p) => p.credit_card === view.card.id) ?? []}
          redemptions={redemptions ?? []}
          onBack={() => setView({ type: 'list' })}
          onEditCard={() => setView({ type: 'edit-card', card: view.card })}
          onDeleteCard={() => handleDeleteRequest('card', view.card.id)}
          onCreatePerk={handleCreatePerk}
          onUpdatePerk={handleUpdatePerk}
          onDeletePerk={(id) => handleDeleteRequest('perk', id)}
          onRedeemPerk={handleRedeemPerk}
          onCreateRedemption={handleCreateRedemption}
          onUpdateRedemption={handleUpdateRedemption}
          onDeleteRedemption={(id) => handleDeleteRequest('redemption', id)}
          isCreatingPerk={createPerkMutation.isPending}
          isUpdatingPerk={updatePerkMutation.isPending}
          isRedeeming={redeemPerkMutation.isPending}
          isCreatingRedemption={createRedemptionMutation.isPending}
          isUpdatingRedemption={updateRedemptionMutation.isPending}
        />
      )}

      {(view.type === 'list' || view.type === 'add-card' || view.type === 'edit-card') && (
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Your Cards</h2>
            <button
              onClick={() => setView({ type: 'add-card' })}
              data-testid="add-credit-card-button"
              className="flex items-center gap-2 text-sm font-medium text-accent-terracotta hover:text-accent-terracotta-hover transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Card
            </button>
          </div>
          <CardList
            cards={activeCards}
            perks={perks ?? []}
            redemptions={redemptions ?? []}
            onSelectCard={(card) => setView({ type: 'detail', card })}
            onEditCard={(card) => setView({ type: 'edit-card', card })}
            onDeleteCard={(id) => handleDeleteRequest('card', id)}
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
                    onSelectCard={(card) => setView({ type: 'detail', card })}
                    onEditCard={(card) => setView({ type: 'edit-card', card })}
                    onDeleteCard={(id) => handleDeleteRequest('card', id)}
                  />
                </div>
              )}
            </div>
          )}

          {activeCards.length === 0 && archivedCards.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No credit cards yet. Add your first card to start tracking perks.</p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setItemToDelete(null); }}
        onConfirm={handleConfirmDelete}
        title={`Delete ${itemToDelete?.type === 'card' ? 'Card' : itemToDelete?.type === 'perk' ? 'Perk' : 'Redemption'}`}
        message={
          itemToDelete?.type === 'card'
            ? 'Are you sure you want to delete this card? All perks and redemptions for this card will also be deleted.'
            : itemToDelete?.type === 'perk'
            ? 'Are you sure you want to delete this perk? All redemptions for this perk will also be deleted.'
            : 'Are you sure you want to delete this redemption?'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteCardMutation.isPending || deletePerkMutation.isPending || deleteRedemptionMutation.isPending}
      />
    </div>
  );
}
