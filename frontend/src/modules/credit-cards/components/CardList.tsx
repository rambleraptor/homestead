/**
 * Card List Component
 *
 * Displays all credit cards with summary stats
 */

import { Pencil, Trash2 } from 'lucide-react';
import { getAnnualizedValue } from '../utils/periodUtils';
import { CoverageProgressBar } from './CoverageProgressBar';
import type { CreditCard, CreditCardPerk, PerkRedemption } from '../types';

interface CardListProps {
  cards: CreditCard[];
  perks: CreditCardPerk[];
  redemptions: PerkRedemption[];
  onSelectCard: (card: CreditCard) => void;
  onEditCard: (card: CreditCard) => void;
  onDeleteCard: (id: string) => void;
}

export function CardList({
  cards,
  perks,
  redemptions,
  onSelectCard,
  onEditCard,
  onDeleteCard,
}: CardListProps) {
  if (cards.length === 0) return null;

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);

  return (
    <div className="space-y-3">
      {cards.map((card) => {
        const cardPerks = perks.filter((p) => p.credit_card === card.id);
        const totalAnnualValue = cardPerks.reduce(
          (sum, p) => sum + getAnnualizedValue(p.value, p.frequency),
          0
        );

        const cardPerkIds = new Set(cardPerks.map((p) => p.id));
        const ytdRedeemed = redemptions
          .filter((r) => {
            if (!cardPerkIds.has(r.perk)) return false;
            const redeemedAt = new Date(r.redeemed_at);
            return redeemedAt >= yearStart && redeemedAt <= yearEnd;
          })
          .reduce((sum, r) => sum + r.amount, 0);

        const netValue = ytdRedeemed - card.annual_fee;

        return (
          <div
            key={card.id}
            className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:bg-gray-50 transition-colors cursor-pointer"
            onClick={() => onSelectCard(card)}
            data-testid={`card-row-${card.id}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 truncate">{card.name}</h3>
                  {card.last_four && (
                    <span className="text-xs text-gray-400">
                      ····{card.last_four}
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                    {card.card_type}
                  </span>
                  {card.archived && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                      archived
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{card.issuer}</p>
              </div>

              <div className="flex items-center gap-4 ml-4">
                <div className="text-right">
                  <div className="text-sm text-gray-500">
                    ${card.annual_fee}/yr fee
                  </div>
                  <div className={`text-sm font-medium ${netValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {netValue >= 0 ? '+' : ''}{formatDollars(netValue)} net
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditCard(card); }}
                    className="p-1.5 text-gray-400 hover:text-primary-600 transition-colors"
                    data-testid={`edit-card-${card.id}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteCard(card.id); }}
                    className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                    data-testid={`delete-card-${card.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3">
              <CoverageProgressBar
                redeemed={ytdRedeemed}
                annualFee={card.annual_fee}
                totalAvailable={totalAnnualValue}
              />
            </div>

            <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
              <span>{cardPerks.length} perk{cardPerks.length !== 1 ? 's' : ''}</span>
              <span>${formatDollars(totalAnnualValue)}/yr available</span>
              <span>${formatDollars(ytdRedeemed)} YTD redeemed</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDollars(amount: number): string {
  return Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
