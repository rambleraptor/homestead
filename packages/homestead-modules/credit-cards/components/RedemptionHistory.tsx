/**
 * Redemption History Component
 *
 * Table showing past redemptions for a card's perks
 */

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { formatPeriod } from '../utils/periodUtils';
import type { PerkRedemption, CreditCardPerk } from '../types';

interface RedemptionHistoryProps {
  redemptions: PerkRedemption[];
  perks: CreditCardPerk[];
  onDeleteRedemption: (id: string) => void;
  onEditRedemption: (redemption: PerkRedemption) => void;
  onAddRedemption: () => void;
}

export function RedemptionHistory({
  redemptions,
  perks,
  onDeleteRedemption,
  onEditRedemption,
  onAddRedemption,
}: RedemptionHistoryProps) {
  const perkMap = new Map(perks.map((p) => [p.id, p]));

  const sorted = [...redemptions].sort(
    (a, b) => new Date(b.period_start).getTime() - new Date(a.period_start).getTime()
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">Redemption History</h3>
        <button
          onClick={onAddRedemption}
          data-testid="add-redemption-button"
          className="flex items-center gap-1 text-sm font-medium text-accent-terracotta hover:text-accent-terracotta-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Redemption
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center py-6 text-gray-400">
          No redemptions yet. Use &quot;Add Redemption&quot; to log historical data.
        </p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 font-medium text-gray-600">Perk</th>
              <th className="text-left py-2 px-2 font-medium text-gray-600">Period</th>
              <th className="text-right py-2 px-2 font-medium text-gray-600">Amount</th>
              <th className="text-right py-2 px-2 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((redemption) => {
              const perk = perkMap.get(redemption.perk);
              const period = {
                start: new Date(redemption.period_start),
                end: new Date(redemption.period_end),
              };
              const periodLabel = perk
                ? formatPeriod(period, perk.frequency)
                : `${formatDate(period.start)} - ${formatDate(period.end)}`;

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
                    {periodLabel}
                  </td>
                  <td className="py-2 px-2 text-right text-green-600 font-medium">
                    ${redemption.amount}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEditRedemption(redemption)}
                        className="p-1 text-gray-400 hover:text-accent-terracotta transition-colors"
                        data-testid={`edit-redemption-${redemption.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteRedemption(redemption.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        data-testid={`delete-redemption-${redemption.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200">
              <td colSpan={2} className="py-2 px-2 font-medium text-gray-600">
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
      )}
    </div>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
