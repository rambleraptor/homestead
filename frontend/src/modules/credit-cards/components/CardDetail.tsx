/**
 * Card Detail Component
 *
 * Shows single card view with perks, redemption status, and history
 */

import { useState } from 'react';
import { ArrowLeft, Pencil, Trash2, Plus } from 'lucide-react';
import { CoverageProgressBar } from './CoverageProgressBar';
import { PerkForm } from './PerkForm';
import { PerkRow } from './PerkRow';
import { RedemptionForm } from './RedemptionForm';
import { RedemptionHistory } from './RedemptionHistory';
import { getAnnualizedValue, getCurrentPeriod, formatPeriod, dateKey } from '../utils/periodUtils';
import type { CreditCard, CreditCardPerk, PerkRedemption, PerkFormData, RedemptionFormData } from '../types';

interface CardDetailProps {
  card: CreditCard;
  perks: CreditCardPerk[];
  redemptions: PerkRedemption[];
  onBack: () => void;
  onEditCard: () => void;
  onDeleteCard: () => void;
  onCreatePerk: (data: PerkFormData) => Promise<void>;
  onUpdatePerk: (id: string, data: PerkFormData) => Promise<void>;
  onDeletePerk: (id: string) => void;
  onRedeemPerk: (perkId: string, amount: number) => Promise<void>;
  onCreateRedemption: (data: RedemptionFormData) => Promise<void>;
  onUpdateRedemption: (id: string, data: RedemptionFormData) => Promise<void>;
  onDeleteRedemption: (id: string) => void;
  isCreatingPerk: boolean;
  isUpdatingPerk: boolean;
  isRedeeming: boolean;
  isCreatingRedemption: boolean;
  isUpdatingRedemption: boolean;
}

export function CardDetail({
  card,
  perks,
  redemptions,
  onBack,
  onEditCard,
  onDeleteCard,
  onCreatePerk,
  onUpdatePerk,
  onDeletePerk,
  onRedeemPerk,
  onCreateRedemption,
  onUpdateRedemption,
  onDeleteRedemption,
  isCreatingPerk,
  isUpdatingPerk,
  isRedeeming,
  isCreatingRedemption,
  isUpdatingRedemption,
}: CardDetailProps) {
  const [showPerkForm, setShowPerkForm] = useState(false);
  const [editingPerk, setEditingPerk] = useState<CreditCardPerk | null>(null);
  const [showRedemptionForm, setShowRedemptionForm] = useState(false);
  const [editingRedemption, setEditingRedemption] = useState<PerkRedemption | null>(null);

  const yearPrefix = `${new Date().getFullYear()}-`;

  const totalAnnualValue = perks.reduce(
    (sum, p) => sum + getAnnualizedValue(p.value, p.frequency),
    0
  );

  const perkIds = new Set(perks.map((p) => p.id));
  const cardRedemptions = redemptions.filter((r) => perkIds.has(r.perk));
  const ytdRedeemed = cardRedemptions
    .filter((r) => dateKey(r.period_start).startsWith(yearPrefix))
    .reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to cards
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onEditCard}
              className="p-2 text-gray-400 hover:text-accent-terracotta transition-colors"
              data-testid="edit-card-detail"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDeleteCard}
              className="p-2 text-gray-400 hover:text-red-600 transition-colors"
              data-testid="delete-card-detail"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{card.name}</h2>
              {card.last_four && (
                <span className="text-sm text-gray-400">····{card.last_four}</span>
              )}
            </div>
            <p className="text-gray-500 mt-1">{card.issuer}</p>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
              <span>Reset: {card.reset_mode === 'calendar_year' ? 'Calendar Year' : 'Anniversary'}</span>
              {card.archived && (
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">archived</span>
              )}
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">${card.annual_fee}</div>
            <div className="text-sm text-gray-500">annual fee</div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-lg font-semibold text-gray-900">${totalAnnualValue}</div>
            <div className="text-xs text-gray-500">Available/yr</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className="text-lg font-semibold text-green-600">${ytdRedeemed}</div>
            <div className="text-xs text-gray-500">YTD Redeemed</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <div className={`text-lg font-semibold ${ytdRedeemed - card.annual_fee >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {ytdRedeemed - card.annual_fee >= 0 ? '+' : ''}${Math.abs(ytdRedeemed - card.annual_fee)}
            </div>
            <div className="text-xs text-gray-500">Net Value</div>
          </div>
        </div>

        <div className="mt-4">
          <CoverageProgressBar
            redeemed={ytdRedeemed}
            annualFee={card.annual_fee}
            totalAvailable={totalAnnualValue}
          />
        </div>

        {card.notes && (
          <p className="mt-3 text-sm text-gray-500 italic">{card.notes}</p>
        )}
      </div>

      {/* Perks */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Perks</h3>
          <button
            onClick={() => { setEditingPerk(null); setShowPerkForm(true); }}
            data-testid="add-perk-button"
            className="flex items-center gap-1 text-sm font-medium text-accent-terracotta hover:text-accent-terracotta-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Perk
          </button>
        </div>

        {perks.length === 0 ? (
          <p className="text-center py-6 text-gray-400">
            No perks yet. Add perks to track their value.
          </p>
        ) : (
          <div className="space-y-2">
            {perks.map((perk) => {
              const period = getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date);
              const periodStartKey = dateKey(period.start);
              const periodEndKey = dateKey(period.end);
              const isRedeemed = cardRedemptions.some((r) => {
                if (r.perk !== perk.id) return false;
                return dateKey(r.period_start) === periodStartKey
                  && dateKey(r.period_end) === periodEndKey;
              });

              return (
                <PerkRow
                  key={perk.id}
                  perk={perk}
                  periodLabel={formatPeriod(period, perk.frequency)}
                  isRedeemed={isRedeemed}
                  onRedeem={() => onRedeemPerk(perk.id, perk.value)}
                  onEdit={() => { setEditingPerk(perk); setShowPerkForm(true); }}
                  onDelete={() => onDeletePerk(perk.id)}
                  isRedeeming={isRedeeming}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Redemption History */}
      <RedemptionHistory
        redemptions={cardRedemptions}
        perks={perks}
        onDeleteRedemption={onDeleteRedemption}
        onEditRedemption={(redemption) => {
          setEditingRedemption(redemption);
          setShowRedemptionForm(true);
        }}
        onAddRedemption={() => {
          setEditingRedemption(null);
          setShowRedemptionForm(true);
        }}
      />

      {/* Perk Form Modal */}
      <PerkForm
        isOpen={showPerkForm}
        onClose={() => { setShowPerkForm(false); setEditingPerk(null); }}
        onSubmit={editingPerk
          ? (data) => onUpdatePerk(editingPerk.id, data)
          : onCreatePerk
        }
        creditCardId={card.id}
        initialData={editingPerk ?? undefined}
        isSubmitting={isCreatingPerk || isUpdatingPerk}
      />

      {/* Redemption Form Modal */}
      <RedemptionForm
        isOpen={showRedemptionForm}
        onClose={() => { setShowRedemptionForm(false); setEditingRedemption(null); }}
        onSubmit={editingRedemption
          ? (data) => onUpdateRedemption(editingRedemption.id, data)
          : onCreateRedemption
        }
        perks={perks}
        card={card}
        initialData={editingRedemption ?? undefined}
        isSubmitting={isCreatingRedemption || isUpdatingRedemption}
      />
    </div>
  );
}
