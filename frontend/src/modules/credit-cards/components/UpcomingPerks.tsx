/**
 * Upcoming Perks Component
 *
 * Action-oriented list of perks not yet redeemed for their current period.
 * Sorted by deadline (soonest first).
 */

import { Clock, Check } from 'lucide-react';
import { formatPeriod, getPeriodDeadline } from '../utils/periodUtils';
import type { UpcomingPerk } from '../types';

interface UpcomingPerksProps {
  upcomingPerks: UpcomingPerk[];
  onRedeem: (perkId: string, amount: number) => Promise<void>;
  isRedeeming: boolean;
  now: number;
}

export function UpcomingPerks({
  upcomingPerks,
  onRedeem,
  isRedeeming,
  now,
}: UpcomingPerksProps) {
  const unredeemed = upcomingPerks.filter((p) => !p.isRedeemed);
  const redeemedCount = upcomingPerks.length - unredeemed.length;

  if (unredeemed.length === 0 && redeemedCount > 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4" data-testid="upcoming-perks">
        <div className="flex items-center gap-2">
          <Check className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-green-700">
            All {redeemedCount} perks redeemed for their current period!
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200" data-testid="upcoming-perks">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-bold text-gray-900">Upcoming Perks</h2>
        </div>
        <span className="text-sm text-gray-500">
          {unredeemed.length} unredeemed · {redeemedCount} done
        </span>
      </div>

      <div className="space-y-2">
        {unredeemed.map((item) => {
          const deadline = getPeriodDeadline(item.currentPeriod);
          const periodLabel = formatPeriod(item.currentPeriod, item.perk.frequency);

          // Calculate urgency: if deadline is within 7 days, highlight
          const daysUntilDeadline = Math.ceil(
            (item.currentPeriod.end.getTime() - now) / (1000 * 60 * 60 * 24)
          );
          const isUrgent = daysUntilDeadline <= 7;

          return (
            <div
              key={`${item.perk.id}-${item.currentPeriod.start.getTime()}`}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                isUrgent ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">{item.perk.name}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500 truncate">{item.card.name}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  ${item.perk.value} · {periodLabel} · Due {deadline}
                  {isUrgent && daysUntilDeadline > 0 && (
                    <span className="text-amber-600 font-medium ml-1">
                      ({daysUntilDeadline}d left)
                    </span>
                  )}
                  {isUrgent && daysUntilDeadline <= 0 && (
                    <span className="text-red-600 font-medium ml-1">
                      (expired!)
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => onRedeem(item.perk.id, item.perk.value)}
                disabled={isRedeeming}
                data-testid={`redeem-upcoming-${item.perk.id}`}
                className="ml-3 px-3 py-1.5 text-xs font-medium bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Redeem
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
