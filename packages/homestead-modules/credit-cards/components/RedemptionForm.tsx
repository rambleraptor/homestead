/**
 * Redemption Form Component
 *
 * Modal form for adding/editing perk redemptions with explicit period dates.
 * Used for historical data entry — the quick "Redeem" button on PerkRow
 * handles current-period redemptions separately.
 */

import { useMemo, useState } from 'react';
import { Modal } from '@/shared/components/Modal';
import {
  getCurrentPeriod,
  getPeriodsInRange,
  formatPeriod,
  toLocalISODate,
} from '../utils/periodUtils';
import type {
  CreditCardPerk,
  CreditCard,
  PerkRedemption,
  RedemptionFormData,
} from '../types';

interface RedemptionFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: RedemptionFormData) => Promise<void>;
  perks: CreditCardPerk[];
  card: CreditCard;
  initialData?: PerkRedemption;
  isSubmitting: boolean;
}

function buildInitialFormData(
  perks: CreditCardPerk[],
  card: CreditCard,
  initialData?: PerkRedemption,
): RedemptionFormData {
  if (initialData) {
    return {
      perk: initialData.perk,
      period_start: initialData.period_start,
      period_end: initialData.period_end,
      amount: initialData.amount,
      notes: initialData.notes ?? '',
    };
  }

  const perk = perks[0];
  const period = perk
    ? getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date)
    : null;

  return {
    perk: perk?.id ?? '',
    period_start: period ? toLocalISODate(period.start) : '',
    period_end: period ? toLocalISODate(period.end) : '',
    amount: perk?.value ?? 0,
    notes: '',
  };
}

/**
 * Inner form body — mounted fresh each time the modal opens via key prop.
 */
function RedemptionFormBody({
  onClose,
  onSubmit,
  perks,
  card,
  initialData,
  isSubmitting,
}: Omit<RedemptionFormProps, 'isOpen'>) {
  const [formData, setFormData] = useState<RedemptionFormData>(
    () => buildInitialFormData(perks, card, initialData),
  );
  const [error, setError] = useState<string | null>(null);

  const selectedPerk = perks.find((p) => p.id === formData.perk);

  // Generate period options: ~1 year back + 1 period forward from today
  const periodOptions = useMemo(() => {
    if (!selectedPerk) return [];
    const now = new Date();
    const rangeStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const rangeEnd = new Date(now.getFullYear() + 1, now.getMonth(), 0);
    return getPeriodsInRange(
      selectedPerk.frequency,
      card.reset_mode,
      card.anniversary_date,
      rangeStart,
      rangeEnd,
    );
  }, [selectedPerk, card.reset_mode, card.anniversary_date]);

  const handlePerkChange = (perkId: string) => {
    const perk = perks.find((p) => p.id === perkId);
    if (!perk) {
      setFormData({ ...formData, perk: perkId });
      return;
    }

    const period = getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date);
    setFormData({
      ...formData,
      perk: perkId,
      period_start: toLocalISODate(period.start),
      period_end: toLocalISODate(period.end),
      amount: perk.value,
    });
  };

  const handlePeriodChange = (value: string) => {
    if (!value) return;
    const [start, end] = value.split('|');
    setFormData({ ...formData, period_start: start, period_end: end });
  };

  const periodSelectValue = formData.period_start && formData.period_end
    ? `${formData.period_start}|${formData.period_end}`
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.perk) {
      setError('Please select a perk');
      return;
    }
    if (!formData.period_start || !formData.period_end) {
      setError('Please select a period');
      return;
    }
    if (formData.amount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save redemption');
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="redemption-form" className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Perk selector — disabled when editing since perk shouldn't change */}
      <div>
        <label htmlFor="redemption-perk" className="block text-sm font-medium text-gray-700 mb-1">
          Perk <span className="text-red-500">*</span>
        </label>
        <select
          id="redemption-perk"
          required
          disabled={!!initialData}
          value={formData.perk}
          onChange={(e) => handlePerkChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta disabled:bg-gray-100 disabled:text-gray-500"
        >
          {perks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Period selector */}
      <div>
        <label htmlFor="redemption-period" className="block text-sm font-medium text-gray-700 mb-1">
          Period <span className="text-red-500">*</span>
        </label>
        <select
          id="redemption-period"
          required
          value={periodSelectValue}
          onChange={(e) => handlePeriodChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
        >
          {periodOptions.map((period) => {
            const key = `${toLocalISODate(period.start)}|${toLocalISODate(period.end)}`;
            return (
              <option key={key} value={key}>
                {selectedPerk ? formatPeriod(period, selectedPerk.frequency) : key}
              </option>
            );
          })}
        </select>
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="redemption-amount" className="block text-sm font-medium text-gray-700 mb-1">
          Amount <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-gray-500">$</span>
          <input
            type="number"
            id="redemption-amount"
            required
            min="0.01"
            step="0.01"
            value={formData.amount || ''}
            onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
            className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="redemption-notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="redemption-notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
          placeholder="Optional notes..."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="redemption-form-submit"
          className="px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            initialData ? 'Update Redemption' : 'Add Redemption'
          )}
        </button>
      </div>
    </form>
  );
}

export function RedemptionForm({
  isOpen,
  onClose,
  onSubmit,
  perks,
  card,
  initialData,
  isSubmitting,
}: RedemptionFormProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Redemption' : 'Add Redemption'}
    >
      {/* Key forces remount when switching between create/edit or different redemptions */}
      <RedemptionFormBody
        key={initialData?.id ?? 'new'}
        onClose={onClose}
        onSubmit={onSubmit}
        perks={perks}
        card={card}
        initialData={initialData}
        isSubmitting={isSubmitting}
      />
    </Modal>
  );
}
