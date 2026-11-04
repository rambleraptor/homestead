/**
 * Credit Cards Home Component
 *
 * The list: KPIs, the perks closing soon, and every card as a link to its own
 * page. Adding, editing and reading a card are routes of their own
 * (`new`, `:id/edit`, `:id`), so they can be opened directly and reloaded.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreditCard, Plus } from 'lucide-react';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { useCreditCards } from '../hooks/useCreditCards';
import { useCreditCardPerks } from '../hooks/useCreditCardPerks';
import { usePerkRedemptions } from '../hooks/usePerkRedemptions';
import { useDeleteCreditCard } from '../hooks/useDeleteCreditCard';
import { useRedeemPerk } from '../hooks/useRedeemPerk';
import { useCreditCardStats } from '../hooks/useCreditCardStats';
import { useUpcomingPerks } from '../hooks/useUpcomingPerks';
import { usePerkCelebration } from '../hooks/usePerkCelebration';
import { getCurrentPeriod, toLocalISODate } from '../utils/periodUtils';
import { CreditCardDashboard } from './CreditCardDashboard';
import { CardList } from './CardList';
import { UpcomingPerks } from './UpcomingPerks';

export function CreditCardsHome() {
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [now] = useState(() => Date.now());
  const navigate = useNavigate();

  const cardsQuery = useCreditCards();
  const { data: cards, isLoading: cardsLoading } = cardsQuery;
  const perksQuery = useCreditCardPerks();
  const redemptionsQuery = usePerkRedemptions();
  const { data: perks } = perksQuery;
  const { data: redemptions } = redemptionsQuery;
  const perksError = perksQuery.error ?? redemptionsQuery.error;

  const stats = useCreditCardStats(cards ?? [], perks ?? [], redemptions ?? []);
  const upcomingPerks = useUpcomingPerks(cards ?? [], perks ?? [], redemptions ?? []);

  const deleteCardMutation = useDeleteCreditCard();
  const redeemPerkMutation = useRedeemPerk();
  const celebrateIfComplete = usePerkCelebration();

  const handleConfirmDelete = async () => {
    if (!cardToDelete) return;
    try {
      await deleteCardMutation.mutateAsync(cardToDelete);
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    } finally {
      setCardToDelete(null);
    }
  };

  const handleRedeemPerk = async (perkId: string, amount: number) => {
    const perk = perks?.find((p) => p.id === perkId);
    const card = cards?.find((c) => c.id === perk?.credit_card);
    if (!perk || !card) return;

    try {
      await redeemPerkMutation.mutateAsync({ perk, card, amount });
      const period = getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date);
      celebrateIfComplete(card, perks ?? [], redemptions ?? [], {
        perk: perk.id,
        period_start: toLocalISODate(period.start),
        period_end: toLocalISODate(period.end),
        amount,
      });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (cardsLoading) {
    return (
      <SkeletonPage
        body="cards"
        label="Loading credit cards"
        data-testid="credit-cards-loading"
      />
    );
  }

  if (cardsQuery.isError) {
    return (
      <QueryError
        error={cardsQuery.error}
        onRetry={() => void cardsQuery.refetch()}
        title="Failed to load credit cards"
        data-testid="credit-cards-error"
      />
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

      {perksError && (
        <QueryError
          error={perksError}
          onRetry={() => {
            void perksQuery.refetch();
            void redemptionsQuery.refetch();
          }}
          title="Couldn’t load perks and redemptions"
          compact
          data-testid="credit-card-perks-error"
        />
      )}

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

      <div className="bg-surface-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-brand-navy">Your Cards</h2>
          <Link
            to="/credit-cards/new"
            data-testid="add-credit-card-button"
            className="flex items-center gap-2 text-sm font-medium text-accent-terracotta hover:text-accent-terracotta-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Card
          </Link>
        </div>
        <CardList
          cards={activeCards}
          perks={perks ?? []}
          redemptions={redemptions ?? []}
          onDeleteCard={setCardToDelete}
        />

        {archivedCards.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className="text-sm text-text-muted hover:text-gray-700 transition-colors"
              data-testid="toggle-archived-cards"
            >
              {showArchived ? 'Hide' : 'Show'} archived cards ({archivedCards.length})
            </button>
            {showArchived && (
              <div className="mt-3">
                <CardList
                  cards={archivedCards}
                  perks={perks ?? []}
                  redemptions={redemptions ?? []}
                  onDeleteCard={setCardToDelete}
                />
              </div>
            )}
          </div>
        )}

        {activeCards.length === 0 && archivedCards.length === 0 && (
          <EmptyState
            icon={CreditCard}
            title="No credit cards yet"
            description="Add a card and its perks to see what you’ve redeemed against the annual fee."
            action={{
              label: 'Add card',
              onClick: () => navigate('/credit-cards/new'),
              testId: 'credit-cards-empty-add',
            }}
            assistantPrompt="Add my Chase Sapphire Reserve with a $550 annual fee"
            compact
            data-testid="credit-cards-empty"
          />
        )}
      </div>

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
    </div>
  );
}
