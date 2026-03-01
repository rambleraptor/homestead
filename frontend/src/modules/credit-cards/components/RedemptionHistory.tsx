/**
 * Redemption History Component
 *
 * Table showing past redemptions for a card's perks
 */

import { Trash2 } from 'lucide-react';
import type { PerkRedemption, CreditCardPerk } from '../types';

interface RedemptionHistoryProps {
  redemptions: PerkRedemption[];
  perks: CreditCardPerk[];
  onDeleteRedemption: (id: string) => void;
}

export function RedemptionHistory({
  redemptions,
  perks,
  onDeleteRedemption,
}: RedemptionHistoryProps) {
  const perkMap = new Map(perks.map((p) => [p.id, p]));

  // Sort by redeemed_at descending
  const sorted = [...redemptions].sort(
    (a, b) => new Date(b.redeemed_at).getTime() - new Date(a.redeemed_at).getTime()
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <h3 className="text-lg font-bold text-gray-900 mb-4">Redemption History</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 font-medium text-gray-600">Perk</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">Period</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">Redeemed</th>
              <th className="text-right py-2 px-2 font-medium text-gray-600">Amount</th>
              <th className="text-right py-2 px-2 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((redemption) => {
              const perk = perkMap.get(redemption.perk);
              const periodStart = new Date(redemption.period_start);
              const periodEnd = new Date(redemption.period_end);

              return (
                <tr
                  key={redemption.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                  data-testid={`redemption-row-${redemption.id}`}
                >
                  <td className="py-2 px-2 text-gray-900">
                    {perk?.name ?? 'Unknown perk'}
                  </td>
                  <td className="py-2 px-2 text-gray-500">
                    {formatDate(periodStart)} - {formatDate(periodEnd)}
                  </td>
                  <td className="py-2 px-2 text-gray-500">
                    {formatDate(new Date(redemption.redeemed_at))}
                  </td>
                  <td className="py-2 px-2 text-right text-green-600 font-medium">
                    ${redemption.amount}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <button
                      onClick={() => onDeleteRedemption(redemption.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      data-testid={`delete-redemption-${redemption.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td colSpan={3} className="py-2 px-2 font-medium text-gray-600">
                Total ({sorted.length} redemption{sorted.length !== 1 ? 's' : ''})
              </td>
              <td className="py-2 px-2 text-right font-bold text-green-600">
                ${sorted.reduce((sum, r) => sum + r.amount, 0)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
