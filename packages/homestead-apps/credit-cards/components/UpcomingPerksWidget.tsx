/**
 * Dashboard widget showing perks that haven't been redeemed for their
 * current period, sorted by deadline. Registered via
 * `creditCardsApp.widgets`.
 */

import { useState } from 'react';
import { Check, Clock, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useCreditCards } from '../hooks/useCreditCards';
import { useCreditCardPerks } from '../hooks/useCreditCardPerks';
import { usePerkRedemptions } from '../hooks/usePerkRedemptions';
import { useUpcomingPerks } from '../hooks/useUpcomingPerks';
import { useRedeemPerk } from '../hooks/useRedeemPerk';
import { usePerkCelebration } from '../hooks/usePerkCelebration';
import {
  URGENT_WINDOW_DAYS,
  formatPeriod,
  getPeriodDeadline,
  toLocalISODate,
} from '../utils/periodUtils';
import type { UpcomingPerk } from '../types';

export function UpcomingPerksWidget() {
  const [now] = useState(() => Date.now());

  const navigate = useNavigate();

  const cardsQuery = useCreditCards();
  const perksQuery = useCreditCardPerks();
  const redemptionsQuery = usePerkRedemptions();
  const { data: cards, isLoading: cardsLoading } = cardsQuery;
  const { data: perks, isLoading: perksLoading } = perksQuery;
  const { data: redemptions, isLoading: redemptionsLoading } = redemptionsQuery;
  const loadError = cardsQuery.error ?? perksQuery.error ?? redemptionsQuery.error;

  const upcomingPerks = useUpcomingPerks(cards ?? [], perks ?? [], redemptions ?? []);
  const redeemPerkMutation = useRedeemPerk();
  const celebrateIfComplete = usePerkCelebration();

  const isLoading = cardsLoading || perksLoading || redemptionsLoading;
  const unredeemed = upcomingPerks.filter((p) => !p.isRedeemed);
  const redeemedCount = upcomingPerks.length - unredeemed.length;

  const handleRedeem = async (item: UpcomingPerk) => {
    try {
      await redeemPerkMutation.mutateAsync({
        perk: item.perk,
        card: item.card,
        amount: item.perk.value,
      });
      celebrateIfComplete(item.card, perks ?? [], redemptions ?? [], {
        perk: item.perk.id,
        period_start: toLocalISODate(item.currentPeriod.start),
        period_end: toLocalISODate(item.currentPeriod.end),
        amount: item.perk.value,
      });
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <WidgetCard
      icon={Clock}
      title="Upcoming Perks"
      href="/credit-cards"
      bodyClassName="px-4 py-0"
      data-testid="upcoming-perks-widget"
    >
      {isLoading ? (
        <SkeletonList
          rows={3}
          label="Loading upcoming perks"
          data-testid="upcoming-perks-widget-loading"
        />
      ) : loadError ? (
        <QueryError
          error={loadError}
          onRetry={() => {
            void cardsQuery.refetch();
            void perksQuery.refetch();
            void redemptionsQuery.refetch();
          }}
          title="Couldn’t load perks"
          compact
          className="my-3"
          data-testid="upcoming-perks-widget-error"
        />
      ) : upcomingPerks.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No perks tracked yet"
          description="Add a card and its perks to see which ones are due."
          action={{ label: 'Go to Credit Cards', onClick: () => navigate('/credit-cards') }}
          compact
          className="my-3"
          data-testid="upcoming-perks-widget-empty"
        />
      ) : unredeemed.length === 0 ? (
        <div className="flex items-center gap-2 py-4">
          <Check className="w-5 h-5 text-green-600" />
          <span className="font-body text-text-main">
            All {redeemedCount} perks redeemed for their current period!
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {unredeemed.map((item) => {
            const deadline = getPeriodDeadline(item.currentPeriod);
            const periodLabel = formatPeriod(item.currentPeriod, item.perk.frequency);
            const daysUntilDeadline = Math.ceil(
              (item.currentPeriod.end.getTime() - now) / (1000 * 60 * 60 * 24),
            );
            const isUrgent = daysUntilDeadline <= URGENT_WINDOW_DAYS;
            const isExpired = daysUntilDeadline <= 0;

            return (
              <li
                key={`${item.perk.id}-${item.currentPeriod.start.getTime()}`}
                className="py-3 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-body font-medium text-text-main truncate">
                      {item.perk.name}
                    </span>
                    <span className="text-xs text-text-muted">·</span>
                    <span className="text-xs text-text-muted truncate">
                      {item.card.name}
                    </span>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    ${item.perk.value} · {periodLabel} · Due {deadline}
                    {isUrgent && !isExpired && (
                      <span className="text-amber-600 font-medium ml-1">
                        ({daysUntilDeadline}d left)
                      </span>
                    )}
                    {isExpired && (
                      <span className="text-red-600 font-medium ml-1">(expired!)</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRedeem(item)}
                  disabled={redeemPerkMutation.isPending}
                  data-testid={`redeem-upcoming-${item.perk.id}`}
                  className="px-3 py-1.5 text-xs font-medium bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Redeem
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
