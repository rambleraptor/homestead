/**
 * Redemption Form Component
 *
 * Modal form for adding/editing perk redemptions with explicit period dates.
 * Markup unchanged; state/validation/submission run through `useSchemaForm`.
 * `perk` is the parent (routing, not a stored field) so it's an extra field;
 * the single period select writes the two schema date fields. Validation keeps
 * the original sequential messages, shown in the top error box.
 */

import { useMemo } from 'react';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { useSchemaForm } from '@rambleraptor/homestead-core/shared/forms';
import {
  getCurrentPeriod,
  getPeriodsInRange,
  formatPeriod,
  toLocalISODate,
} from '../utils/periodUtils';
import { creditCardsResources } from '../resources';
import type {
  CreditCardPerk,
  CreditCard,
  PerkRedemption,
  RedemptionFormData,
} from '../types';

const redemptionDef = creditCardsResources.find((r) => r.singular === 'redemption')!;

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
  const form = useSchemaForm<RedemptionFormData>({
    resource: redemptionDef,
    initialData: buildInitialFormData(perks, card, initialData),
    // perk is the parent (URL-encoded); period is required but validated by the
    // sequential rule below, so suppress the per-field required messages.
    extraFields: { perk: { type: 'string' } },
    fields: {
      period_start: { required: false },
      period_end: { required: false },
      amount: { required: false },
    },
    validate: (v): Record<string, string> | null => {
      if (!v.perk) return { perk: 'Please select a perk' };
      if (!v.period_start || !v.period_end) return { period_start: 'Please select a period' };
      if ((v.amount as number) <= 0) return { amount: 'Amount must be greater than 0' };
      return null;
    },
    buildPayload: (v) => ({
      perk: v.perk as string,
      period_start: v.period_start as string,
      period_end: v.period_end as string,
      amount: v.amount as number,
      notes: v.notes as string,
    }),
    onSubmit: async (data) => {
      await onSubmit(data);
      onClose();
    },
  });

  const busy = isSubmitting || form.isSubmitting;
  const selectedPerk = perks.find((p) => p.id === form.values.perk);

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
      form.setValue('perk', perkId);
      return;
    }
    const period = getCurrentPeriod(perk.frequency, card.reset_mode, card.anniversary_date);
    form.setValues({
      perk: perkId,
      period_start: toLocalISODate(period.start),
      period_end: toLocalISODate(period.end),
      amount: perk.value,
    });
  };

  const handlePeriodChange = (value: string) => {
    if (!value) return;
    const [start, end] = value.split('|');
    form.setValues({ period_start: start, period_end: end });
  };

  const periodSelectValue =
    form.values.period_start && form.values.period_end
      ? `${form.values.period_start}|${form.values.period_end}`
      : '';

  const topError =
    form.errors.perk || form.errors.period_start || form.errors.amount || form.formError;

  return (
    <form onSubmit={form.handleSubmit} data-testid="redemption-form" className="space-y-4">
      {topError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{topError}</p>
        </div>
      )}

      {/* Perk selector — disabled when editing since perk shouldn't change */}
      <div>
        <label htmlFor="redemption-perk" className="block text-sm font-medium text-gray-700 mb-1">
          Perk <span className="text-red-500">*</span>
        </label>
        <select
          id="redemption-perk"
          disabled={!!initialData}
          value={(form.values.perk as string) ?? ''}
          onChange={(e) => handlePerkChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta disabled:bg-gray-100 disabled:text-text-muted"
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
          <span className="absolute left-3 top-2 text-text-muted">$</span>
          <input
            type="number"
            id="redemption-amount"
            min="0.01"
            step="0.01"
            value={(form.values.amount as number) || ''}
            onChange={(e) => form.setValue('amount', parseFloat(e.target.value) || 0)}
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
          value={(form.values.notes as string) ?? ''}
          onChange={(e) => form.setValue('notes', e.target.value)}
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
          disabled={busy}
          className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          data-testid="redemption-form-submit"
          className="px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {busy ? (
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
