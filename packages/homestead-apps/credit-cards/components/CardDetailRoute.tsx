/**
 * A credit card at its own address: `/credit-cards/:id`.
 *
 * Loads the card by id (so the page survives a reload and can be shared),
 * joins its perks and redemptions from the app-wide lists, and owns the
 * delete confirmations for the card, a perk, or a redemption. Deleting the
 * card returns to the list; everything else stays here.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useCreditCard } from '../hooks/useCreditCard';
import { useCreditCardPerks } from '../hooks/useCreditCardPerks';
import { usePerkRedemptions } from '../hooks/usePerkRedemptions';
import { useDeleteCreditCard } from '../hooks/useDeleteCreditCard';
import { useCreatePerk } from '../hooks/useCreatePerk';
import { useUpdatePerk } from '../hooks/useUpdatePerk';
import { useDeletePerk } from '../hooks/useDeletePerk';
import { useRedeemPerk } from '../hooks/useRedeemPerk';
import { useCreateRedemption } from '../hooks/useCreateRedemption';
import { useUpdateRedemption } from '../hooks/useUpdateRedemption';
import { useDeleteRedemption } from '../hooks/useDeleteRedemption';
import { usePerkCelebration } from '../hooks/usePerkCelebration';
import { getCurrentPeriod, toLocalISODate } from '../utils/periodUtils';
import { CardDetail } from './CardDetail';
import type { PerkFormData, RedemptionFormData } from '../types';

type Deletable = { type: 'card' | 'perk' | 'redemption'; id: string };

const DELETE_TITLES: Record<Deletable['type'], string> = {
  card: 'Delete Card',
  perk: 'Delete Perk',
  redemption: 'Delete Redemption',
};

const DELETE_MESSAGES: Record<Deletable['type'], string> = {
  card: 'Are you sure you want to delete this card? All perks and redemptions for this card will also be deleted.',
  perk: 'Are you sure you want to delete this perk? All redemptions for this perk will also be deleted.',
  redemption: 'Are you sure you want to delete this redemption?',
};

export function CardDetailRoute({ params }: AppRouteProps) {
  const id = params?.id ?? '';
  const navigate = useNavigate();
  const [itemToDelete, setItemToDelete] = useState<Deletable | null>(null);

  const { data: card, isLoading: cardLoading, isError: cardError, error } = useCreditCard(id);
  const { data: perks, isLoading: perksLoading } = useCreditCardPerks();
  const { data: redemptions, isLoading: redemptionsLoading } = usePerkRedemptions();

  const deleteCardMutation = useDeleteCreditCard();
  const createPerkMutation = useCreatePerk();
  const updatePerkMutation = useUpdatePerk();
  const deletePerkMutation = useDeletePerk();
  const redeemPerkMutation = useRedeemPerk();
  const createRedemptionMutation = useCreateRedemption();
  const updateRedemptionMutation = useUpdateRedemption();
  const deleteRedemptionMutation = useDeleteRedemption();
  const celebrateIfComplete = usePerkCelebration();

  if (cardLoading || perksLoading || redemptionsLoading) {
    return (
      <SkeletonPage
        body="list"
        bodyCount={3}
        label="Loading credit card"
        data-testid="credit-card-detail-loading"
      />
    );
  }

  if (cardError || !card) {
    return (
      <div className="space-y-4">
        <Link
          to="/credit-cards"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to cards
        </Link>
        <div
          role="alert"
          className="bg-red-50/20 border border-red-200 rounded-lg p-6"
          data-testid="credit-card-detail-error"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">
                {cardError ? 'Failed to load this card' : 'This card could not be found'}
              </h3>
              {cardError && (
                <p className="text-sm text-red-700">
                  {error instanceof Error ? error.message : 'An error occurred'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cardPerks = (perks ?? []).filter((p) => p.credit_card === card.id);
  const allRedemptions = redemptions ?? [];

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (itemToDelete.type === 'card') {
        await deleteCardMutation.mutateAsync(itemToDelete.id);
        navigate('/credit-cards');
      } else if (itemToDelete.type === 'perk') {
        await deletePerkMutation.mutateAsync(itemToDelete.id);
      } else {
        await deleteRedemptionMutation.mutateAsync(itemToDelete.id);
      }
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    } finally {
      setItemToDelete(null);
    }
  };

  const handleCreatePerk = async (data: PerkFormData) => {
    try {
      await createPerkMutation.mutateAsync(data);
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleUpdatePerk = async (perkId: string, data: PerkFormData) => {
    try {
      await updatePerkMutation.mutateAsync({ id: perkId, data });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleRedeemPerk = async (perkId: string, amount: number) => {
    const perk = cardPerks.find((p) => p.id === perkId);
    if (!perk) return;
    try {
      await redeemPerkMutation.mutateAsync({ perk, card, amount });
      const period = getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date);
      celebrateIfComplete(card, cardPerks, allRedemptions, {
        perk: perk.id,
        period_start: toLocalISODate(period.start),
        period_end: toLocalISODate(period.end),
        amount,
      });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleCreateRedemption = async (data: RedemptionFormData) => {
    try {
      await createRedemptionMutation.mutateAsync(data);
      celebrateIfComplete(card, cardPerks, allRedemptions, data);
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  const handleUpdateRedemption = async (redemptionId: string, data: RedemptionFormData) => {
    try {
      await updateRedemptionMutation.mutateAsync({ id: redemptionId, data });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <>
      <CardDetail
        card={card}
        perks={cardPerks}
        redemptions={allRedemptions}
        backHref="/credit-cards"
        editHref={`/credit-cards/${card.id}/edit`}
        onDeleteCard={() => setItemToDelete({ type: 'card', id: card.id })}
        onCreatePerk={handleCreatePerk}
        onUpdatePerk={handleUpdatePerk}
        onDeletePerk={(perkId) => setItemToDelete({ type: 'perk', id: perkId })}
        onRedeemPerk={handleRedeemPerk}
        onCreateRedemption={handleCreateRedemption}
        onUpdateRedemption={handleUpdateRedemption}
        onDeleteRedemption={(redemptionId) => setItemToDelete({ type: 'redemption', id: redemptionId })}
        isCreatingPerk={createPerkMutation.isPending}
        isUpdatingPerk={updatePerkMutation.isPending}
        isRedeeming={redeemPerkMutation.isPending}
        isCreatingRedemption={createRedemptionMutation.isPending}
        isUpdatingRedemption={updateRedemptionMutation.isPending}
      />

      <ConfirmDialog
        isOpen={itemToDelete !== null}
        onClose={() => setItemToDelete(null)}
        onConfirm={handleConfirmDelete}
        title={itemToDelete ? DELETE_TITLES[itemToDelete.type] : ''}
        message={itemToDelete ? DELETE_MESSAGES[itemToDelete.type] : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={
          deleteCardMutation.isPending ||
          deletePerkMutation.isPending ||
          deleteRedemptionMutation.isPending
        }
      />
    </>
  );
}
