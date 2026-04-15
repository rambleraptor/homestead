/**
 * Perk Row Component
 *
 * Single perk display with redemption status and action buttons
 */

import { Check, Pencil, Trash2 } from 'lucide-react';
import { getAnnualizedValue } from '../utils/periodUtils';
import type { CreditCardPerk } from '../types';

interface PerkRowProps {
  perk: CreditCardPerk;
  periodLabel: string;
  isRedeemed: boolean;
  onRedeem: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isRedeeming: boolean;
}

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'mo',
  quarterly: 'qtr',
  semi_annual: '6mo',
  annual: 'yr',
};

const CATEGORY_COLORS: Record<string, string> = {
  travel: 'bg-blue-100 text-blue-700',
  dining: 'bg-orange-100 text-orange-700',
  streaming: 'bg-purple-100 text-purple-700',
  credits: 'bg-green-100 text-green-700',
  insurance: 'bg-gray-100 text-gray-700',
  lounge: 'bg-indigo-100 text-indigo-700',
  other: 'bg-gray-100 text-gray-600',
};

export function PerkRow({
  perk,
  periodLabel,
  isRedeemed,
  onRedeem,
  onEdit,
  onDelete,
  isRedeeming,
}: PerkRowProps) {
  const annualValue = getAnnualizedValue(perk.value, perk.frequency);

  return (
    <div
      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
        isRedeemed
          ? 'border-green-200 bg-green-50/50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
      data-testid={`perk-row-${perk.id}`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Status indicator */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
          isRedeemed ? 'bg-green-500 text-white' : 'border-2 border-gray-300'
        }`}>
          {isRedeemed && <Check className="w-3.5 h-3.5" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${isRedeemed ? 'text-green-700' : 'text-gray-900'} truncate`}>
              {perk.name}
            </span>
            {perk.category && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[perk.category] ?? CATEGORY_COLORS.other}`}>
                {perk.category}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            ${perk.value}/{FREQUENCY_LABELS[perk.frequency]} · ${annualValue}/yr · {periodLabel}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-2">
        {!isRedeemed && (
          <button
            onClick={onRedeem}
            disabled={isRedeeming}
            data-testid={`redeem-perk-${perk.id}`}
            className="px-3 py-1 text-xs font-medium bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Redeem
          </button>
        )}
        {isRedeemed && (
          <span className="text-xs text-green-600 font-medium px-2">Redeemed</span>
        )}
        <button
          onClick={onEdit}
          className="p-1 text-gray-400 hover:text-accent-terracotta transition-colors"
          data-testid={`edit-perk-${perk.id}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          data-testid={`delete-perk-${perk.id}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
