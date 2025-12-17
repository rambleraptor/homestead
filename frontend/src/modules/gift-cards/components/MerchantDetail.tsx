/**
 * Merchant Detail Component
 *
 * Displays individual gift cards for a merchant
 */

import { useState } from 'react';
import { ArrowLeft, CreditCard, Edit2, Trash2, Eye, EyeOff, ChevronDown, ChevronUp, Minus, Edit } from 'lucide-react';
import { useCreateTransaction } from '../hooks/useCreateTransaction';
import type { GiftCard } from '../types';
import { pb } from '@/core/api/pocketbase';

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
  const [showArchived, setShowArchived] = useState(false);
  const [transactionAmount, setTransactionAmount] = useState<Record<string, string>>({});

  const createTransaction = useCreateTransaction();

  // Separate active and archived cards
  const activeCards = cards.filter((card) => !card.archived);
  const archivedCards = cards.filter((card) => card.archived);

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

  const handleDecrementAmount = (card: GiftCard, cardId: string) => {
    const amount = parseFloat(transactionAmount[cardId] || '0');
    if (amount <= 0) return;

    createTransaction.mutate({
      giftCardId: cardId,
      currentAmount: card.amount,
      data: {
        transaction_type: 'decrement',
        amount,
      },
    });

    // Clear the input
    setTransactionAmount((prev) => ({ ...prev, [cardId]: '' }));
  };

  const handleSetAmount = (card: GiftCard, cardId: string) => {
    const amount = parseFloat(transactionAmount[cardId] || '0');
    if (amount < 0) return;

    createTransaction.mutate({
      giftCardId: cardId,
      currentAmount: card.amount,
      data: {
        transaction_type: 'set',
        amount,
      },
    });

    // Clear the input
    setTransactionAmount((prev) => ({ ...prev, [cardId]: '' }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
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
              {activeCards.length} active {activeCards.length === 1 ? 'card' : 'cards'}
              {archivedCards.length > 0 && ` • ${archivedCards.length} archived`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-700 mb-1">Total Balance</p>
            <p className="text-4xl font-bold">${totalAmount.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Active Gift Cards */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Active Cards</h3>
        {activeCards.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No active cards</p>
        ) : (
          activeCards.map((card) => (
            <div
              key={card.id}
              className="bg-white rounded-lg border border-gray-200 p-5"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-primary-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      ${card.amount.toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Added {card.created ? new Date(card.created).toLocaleDateString() : 'Recently'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onEdit(card)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Edit card"
                    aria-label={`Edit ${merchant} card ($${card.amount.toFixed(2)})`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(card.id)}
                    className="p-2 text-red-600 hover:bg-red-50/20 rounded-lg transition-colors"
                    title="Delete card"
                    aria-label={`Delete ${merchant} card ($${card.amount.toFixed(2)})`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Transaction Controls */}
              <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quick Transaction
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={transactionAmount[card.id] || ''}
                    onChange={(e) =>
                      setTransactionAmount((prev) => ({ ...prev, [card.id]: e.target.value }))
                    }
                    placeholder="Amount"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => handleDecrementAmount(card, card.id)}
                    disabled={!transactionAmount[card.id] || parseFloat(transactionAmount[card.id]) <= 0}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    title="Subtract amount from balance"
                  >
                    <Minus className="w-4 h-4" />
                    Use
                  </button>
                  <button
                    onClick={() => handleSetAmount(card, card.id)}
                    disabled={!transactionAmount[card.id] || parseFloat(transactionAmount[card.id]) < 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                    title="Set balance to this amount"
                  >
                    <Edit className="w-4 h-4" />
                    Set
                  </button>
                </div>
              </div>

              {/* Card Details */}
              <div className="space-y-3">
                {/* Card Number */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-gray-700">
                      Card Number
                    </label>
                    <button
                      onClick={() => toggleNumberVisibility(card.id)}
                      className="text-xs text-primary-600 hover:underline flex items-center gap-1"
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
                  <p className="font-mono text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                    {maskString(card.card_number, visibleNumbers.has(card.id))}
                  </p>
                </div>

                {/* PIN */}
                {card.pin && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm font-medium text-gray-700">
                        PIN
                      </label>
                      <button
                        onClick={() => togglePinVisibility(card.id)}
                        className="text-xs text-primary-600 hover:underline flex items-center gap-1"
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
                    <p className="font-mono text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                      {maskString(card.pin, visiblePins.has(card.id))}
                    </p>
                  </div>
                )}

                {/* Notes */}
                {card.notes && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <p className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                      {card.notes}
                    </p>
                  </div>
                )}

                {/* Card Images */}
                {(card.front_image || card.back_image) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Card Images
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {card.front_image && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Front</p>
                          <img
                            src={pb.files.getURL(card, card.front_image)}
                            alt="Front of gift card"
                            className="w-full h-32 object-cover rounded border border-gray-200"
                          />
                        </div>
                      )}
                      {card.back_image && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Back</p>
                          <img
                            src={pb.files.getURL(card, card.back_image)}
                            alt="Back of gift card"
                            className="w-full h-32 object-cover rounded border border-gray-200"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Archived Gift Cards */}
      {archivedCards.length > 0 && (
        <div className="space-y-4">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            {showArchived ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            <span className="font-medium">
              Archived Cards ({archivedCards.length})
            </span>
          </button>

          {showArchived && (
            <div className="space-y-4">
              {archivedCards.map((card) => (
                <div
                  key={card.id}
                  className="bg-white rounded-lg border border-gray-200 p-5 opacity-60"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-6 h-6 text-gray-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-gray-900">
                          ${card.amount.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Archived • Added {card.created ? new Date(card.created).toLocaleDateString() : 'Recently'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onEdit(card)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Edit card"
                        aria-label={`Edit ${merchant} card ($${card.amount.toFixed(2)})`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(card.id)}
                        className="p-2 text-red-600 hover:bg-red-50/20 rounded-lg transition-colors"
                        title="Delete card"
                        aria-label={`Delete ${merchant} card ($${card.amount.toFixed(2)})`}
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
                        <label className="text-sm font-medium text-gray-700">
                          Card Number
                        </label>
                        <button
                          onClick={() => toggleNumberVisibility(card.id)}
                          className="text-xs text-primary-600 hover:underline flex items-center gap-1"
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
                      <p className="font-mono text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                        {maskString(card.card_number, visibleNumbers.has(card.id))}
                      </p>
                    </div>

                    {/* PIN */}
                    {card.pin && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-sm font-medium text-gray-700">
                            PIN
                          </label>
                          <button
                            onClick={() => togglePinVisibility(card.id)}
                            className="text-xs text-primary-600 hover:underline flex items-center gap-1"
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
                        <p className="font-mono text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                          {maskString(card.pin, visiblePins.has(card.id))}
                        </p>
                      </div>
                    )}

                    {/* Notes */}
                    {card.notes && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Notes
                        </label>
                        <p className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded border border-gray-200">
                          {card.notes}
                        </p>
                      </div>
                    )}

                    {/* Card Images */}
                    {(card.front_image || card.back_image) && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Card Images
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {card.front_image && (
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Front</p>
                              <img
                                src={pb.files.getURL(card, card.front_image)}
                                alt="Front of gift card"
                                className="w-full h-32 object-cover rounded border border-gray-200"
                              />
                            </div>
                          )}
                          {card.back_image && (
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Back</p>
                              <img
                                src={pb.files.getURL(card, card.back_image)}
                                alt="Back of gift card"
                                className="w-full h-32 object-cover rounded border border-gray-200"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
