/**
 * Merchant Detail Component
 *
 * Displays individual gift cards for a merchant
 */

import { useState } from 'react';
import { ArrowLeft, CreditCard, Edit2, Trash2, Eye, EyeOff } from 'lucide-react';
import type { GiftCard } from '../types';

interface MerchantDetailProps {
  merchant: string;
  cards: GiftCard[];
  totalAmount: number;
  onBack: () => void;
  onEdit: (card: GiftCard) => void;
  onDelete: (id: string) => void;
}

export function MerchantDetail({
  merchant,
  cards,
  totalAmount,
  onBack,
  onEdit,
  onDelete,
}: MerchantDetailProps) {
  const [visiblePins, setVisiblePins] = useState<Set<string>>(new Set());
  const [visibleNumbers, setVisibleNumbers] = useState<Set<string>>(new Set());

  const togglePinVisibility = (cardId: string) => {
    setVisiblePins((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const toggleNumberVisibility = (cardId: string) => {
    setVisibleNumbers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const maskString = (str: string, visible: boolean) => {
    if (visible || !str) return str;
    return '•'.repeat(Math.min(str.length, 16));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back to Merchants</span>
        </button>
      </div>

      {/* Merchant Summary */}
      <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg shadow-md p-6 text-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">{merchant}</h2>
            <p className="text-gray-700">
              {cards.length} {cards.length === 1 ? 'card' : 'cards'} available
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-700 mb-1">Total Balance</p>
            <p className="text-4xl font-bold">${totalAmount.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Gift Cards */}
      <div className="space-y-4">
        {cards.map((card) => (
          <div
            key={card.id}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    ${card.amount.toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Added {card.created ? new Date(card.created).toLocaleDateString() : 'Recently'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onEdit(card)}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Edit card"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDelete(card.id)}
                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Delete card"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Card Details */}
            <div className="space-y-3">
              {/* Card Number */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Card Number
                  </label>
                  <button
                    onClick={() => toggleNumberVisibility(card.id)}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                  >
                    {visibleNumbers.has(card.id) ? (
                      <>
                        <EyeOff className="w-3 h-3" /> Hide
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" /> Show
                      </>
                    )}
                  </button>
                </div>
                <p className="font-mono text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded border border-gray-200 dark:border-gray-700">
                  {maskString(card.card_number, visibleNumbers.has(card.id))}
                </p>
              </div>

              {/* PIN */}
              {card.pin && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      PIN
                    </label>
                    <button
                      onClick={() => togglePinVisibility(card.id)}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1"
                    >
                      {visiblePins.has(card.id) ? (
                        <>
                          <EyeOff className="w-3 h-3" /> Hide
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" /> Show
                        </>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded border border-gray-200 dark:border-gray-700">
                    {maskString(card.pin, visiblePins.has(card.id))}
                  </p>
                </div>
              )}

              {/* Notes */}
              {card.notes && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notes
                  </label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded border border-gray-200 dark:border-gray-700">
                    {card.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
