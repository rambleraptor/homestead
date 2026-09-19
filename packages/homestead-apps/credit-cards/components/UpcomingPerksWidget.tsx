/**
 * Dashboard widget showing perks that haven't been redeemed for their
 * current period, sorted by deadline. Registered via
 * `creditCardsApp.widgets`.
 */

import { useState } from 'react';
import { Check, Clock } from 'lucide-react';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { WidgetCard } from '@rambleraptor/homestead-core/shared/components/WidgetCard';
import { useCreditCards } from '../hooks/useCreditCards';
import { useCreditCardPerks } from '../hooks/useCreditCardPerks';
import { usePerkRedemptions } from '../hooks/usePerkRedemptions';
import { useUpcomingPerks } from '../hooks/useUpcomingPerks';
import { useRedeemPerk } from '../hooks/useRedeemPerk';
import {
  URGENT_WINDOW_DAYS,
  formatPeriod,
  getPeriodDeadline,
} from '../utils/periodUtils';
import type { UpcomingPerk } from '../types';

export function UpcomingPerksWidget() {
  const [now] = useState(() => Date.now());

  const { data: cards, isLoading: cardsLoading } = useCreditCards();
  const { data: perks, isLoading: perksLoading } = useCreditCardPerks();
  const { data: redemptions, isLoading: redemptionsLoading } = usePerkRedemptions();

  const upcomingPerks = useUpcomingPerks(cards ?? [], perks ?? [], redemptions ?? []);
  const redeemPerkMutation = useRedeemPerk();

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
    } catch (err) {
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
      ) : upcomingPerks.length === 0 ? (
        <p className="font-body text-text-muted py-6 text-center">
          No perks tracked yet — add one from the Credit Cards page.
        </p>
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
