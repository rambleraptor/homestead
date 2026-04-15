/**
 * Perk Form Component
 *
 * Modal form for adding/editing perks on a credit card
 */

import { useState } from 'react';
import { Modal } from '@/shared/components/Modal';
import type { PerkFormData, PerkFrequency, PerkCategory, CreditCardPerk } from '../types';

interface PerkFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: PerkFormData) => Promise<void>;
  creditCardId: string;
  initialData?: CreditCardPerk;
  isSubmitting: boolean;
}

const FREQUENCY_OPTIONS: { value: PerkFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semi_annual', label: 'Semi-Annual' },
  { value: 'annual', label: 'Annual' },
];

const CATEGORY_OPTIONS: { value: PerkCategory; label: string }[] = [
  { value: 'travel', label: 'Travel' },
  { value: 'dining', label: 'Dining' },
  { value: 'streaming', label: 'Streaming' },
  { value: 'credits', label: 'Credits' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'lounge', label: 'Lounge' },
  { value: 'other', label: 'Other' },
];

export function PerkForm({
  isOpen,
  onClose,
  onSubmit,
  creditCardId,
  initialData,
  isSubmitting,
}: PerkFormProps) {
  const [formData, setFormData] = useState<PerkFormData>({
    credit_card: creditCardId,
    name: initialData?.name ?? '',
    value: initialData?.value ?? 0,
    frequency: initialData?.frequency ?? 'monthly',
    category: initialData?.category,
    notes: initialData?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Perk name is required');
      return;
    }

    if (formData.value <= 0) {
      setError('Value must be greater than 0');
      return;
    }

    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save perk');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialData ? 'Edit Perk' : 'Add Perk'}>
      <form onSubmit={handleSubmit} data-testid="perk-form" className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Perk Name */}
          <div className="md:col-span-2">
            <label htmlFor="perk-name" className="block text-sm font-medium text-gray-700 mb-1">
              Perk Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="perk-name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
              placeholder="e.g. Dining Credit, Uber Cash"
            />
          </div>

          {/* Value */}
          <div>
            <label htmlFor="perk-value" className="block text-sm font-medium text-gray-700 mb-1">
              Value per Period <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">$</span>
              <input
                type="number"
                id="perk-value"
                required
                min="0.01"
                step="0.01"
                value={formData.value || ''}
                onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Frequency */}
          <div>
            <label htmlFor="perk-frequency" className="block text-sm font-medium text-gray-700 mb-1">
              Frequency <span className="text-red-500">*</span>
            </label>
            <select
              id="perk-frequency"
              required
              value={formData.frequency}
              onChange={(e) => setFormData({ ...formData, frequency: e.target.value as PerkFrequency })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
            >
              {FREQUENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="perk-category" className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              id="perk-category"
              value={formData.category ?? ''}
              onChange={(e) => setFormData({ ...formData, category: (e.target.value || undefined) as PerkCategory | undefined })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
            >
              <option value="">None</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="perk-notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            id="perk-notes"
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
            data-testid="perk-form-submit"
            className="px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              initialData ? 'Update Perk' : 'Add Perk'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
