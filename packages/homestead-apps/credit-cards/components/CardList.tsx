/**
 * Card List Component
 *
 * Displays all credit cards with summary stats. Each tile is a link to the
 * card's own page (`/credit-cards/:id`), so a card can be opened in a new tab,
 * shared, or reloaded; the edit and delete actions sit beside the link rather
 * than inside it, since a button can't live in an anchor.
 *
 * On first paint the tiles rise into place one after another — a short
 * stagger, capped so a long list doesn't make the last tile wait. The global
 * reduced-motion guard zeroes both the duration and the delay.
 */

import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { viewTransitionName } from '@rambleraptor/homestead-core/shared/motion/viewTransition';
import { getAnnualizedValue, dateKey } from '../utils/periodUtils';
import { CoverageProgressBar } from './CoverageProgressBar';
import type { CreditCard, CreditCardPerk, PerkRedemption } from '../types';

const TILE_STAGGER_MS = 30;
const MAX_STAGGERED_TILES = 8;

interface CardListProps {
  cards: CreditCard[];
  perks: CreditCardPerk[];
  redemptions: PerkRedemption[];
  onDeleteCard: (id: string) => void;
}

export function cardHref(id: string): string {
  return `/credit-cards/${id}`;
}

export function CardList({
  cards,
  perks,
  redemptions,
  onDeleteCard,
}: CardListProps) {
  if (cards.length === 0) return null;

  const yearPrefix = `${new Date().getFullYear()}-`;

  return (
    <div className="space-y-3">
      {cards.map((card, index) => {
        const cardPerks = perks.filter((p) => p.credit_card === card.id);
        const totalAnnualValue = cardPerks.reduce(
          (sum, p) => sum + getAnnualizedValue(p.value, p.frequency),
          0
        );

        const cardPerkIds = new Set(cardPerks.map((p) => p.id));
        const ytdRedeemed = redemptions
          .filter((r) => {
            if (!cardPerkIds.has(r.perk)) return false;
            return dateKey(r.period_start).startsWith(yearPrefix);
          })
          .reduce((sum, r) => sum + r.amount, 0);

        const netValue = ytdRedeemed - card.annual_fee;

        return (
          <div
            key={card.id}
            className="animate-field-rise relative border border-gray-200 rounded-lg hover:border-accent-terracotta/30 hover:bg-gray-50 transition-colors"
            style={{ animationDelay: `${Math.min(index, MAX_STAGGERED_TILES) * TILE_STAGGER_MS}ms` }}
          >
            <Link
              to={cardHref(card.id)}
              className="block p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-terracotta rounded-lg"
              data-testid={`card-row-${card.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3
                      className="font-semibold text-gray-900 truncate"
                      style={viewTransitionName('credit-card', card.id)}
                    >
                      {card.name}
                    </h3>
                    {card.last_four && (
                      <span className="text-xs text-gray-400">
                        ····{card.last_four}
                      </span>
                    )}
                    {card.archived && (
                      <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                        archived
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{card.issuer}</p>
                </div>

                {/* Room on the right for the actions that sit over the tile. */}
                <div className="text-right ml-4 pr-16">
                  <div className="text-sm text-gray-500">
                    ${card.annual_fee}/yr fee
                  </div>
                  <div className={`text-sm font-medium ${netValue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {netValue >= 0 ? '+' : ''}{formatDollars(netValue)} net
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
            </Link>

            <div className="absolute top-4 right-4 flex items-center gap-1">
              <Link
                to={`${cardHref(card.id)}/edit`}
                className="p-1.5 text-gray-400 hover:text-accent-terracotta transition-colors"
                aria-label={`Edit ${card.name}`}
                data-testid={`edit-card-${card.id}`}
              >
                <Pencil className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => onDeleteCard(card.id)}
                className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                aria-label={`Delete ${card.name}`}
                data-testid={`delete-card-${card.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
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
