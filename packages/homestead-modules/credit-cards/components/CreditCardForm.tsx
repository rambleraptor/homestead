/**
 * Credit Card Form Component
 *
 * Form for adding/editing credit cards
 */

import { useState } from 'react';
import type { CreditCardFormData, ResetMode, CreditCard } from '../types';

interface CreditCardFormProps {
  initialData?: CreditCard;
  onSubmit: (data: CreditCardFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function CreditCardForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting,
}: CreditCardFormProps) {
  const [formData, setFormData] = useState<CreditCardFormData>({
    name: initialData?.name ?? '',
    issuer: initialData?.issuer ?? '',
    last_four: initialData?.last_four ?? '',
    annual_fee: initialData?.annual_fee ?? 0,
    anniversary_date: initialData?.anniversary_date?.split('T')[0] ?? '',
    reset_mode: initialData?.reset_mode ?? 'calendar_year',
    notes: initialData?.notes ?? '',
    archived: initialData?.archived ?? false,
  });
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Card name is required');
      return;
    }

    if (!formData.issuer.trim()) {
      setError('Issuer is required');
      return;
    }

    if (!formData.anniversary_date) {
      setError('Anniversary date is required');
      return;
    }

    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save card');
    }
  };

  return (
    <form onSubmit={handleSubmit} data-testid="credit-card-form" className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card Name */}
        <div>
          <label htmlFor="card-name" className="block text-sm font-medium text-gray-700 mb-1">
            Card Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="card-name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
            placeholder="e.g. Amex Gold"
          />
        </div>

        {/* Issuer */}
        <div>
          <label htmlFor="card-issuer" className="block text-sm font-medium text-gray-700 mb-1">
            Issuer <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="card-issuer"
            required
            value={formData.issuer}
            onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
            placeholder="e.g. American Express"
          />
        </div>

        {/* Last Four */}
        <div>
          <label htmlFor="card-last-four" className="block text-sm font-medium text-gray-700 mb-1">
            Last 4 Digits
          </label>
          <input
            type="text"
            id="card-last-four"
            maxLength={4}
            value={formData.last_four}
            onChange={(e) => setFormData({ ...formData, last_four: e.target.value.replace(/\D/g, '').slice(0, 4) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
            placeholder="1234"
          />
        </div>

        {/* Annual Fee */}
        <div>
          <label htmlFor="card-annual-fee" className="block text-sm font-medium text-gray-700 mb-1">
            Annual Fee <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-500">$</span>
            <input
              type="number"
              id="card-annual-fee"
              required
              min="0"
              step="1"
              value={formData.annual_fee || ''}
              onChange={(e) => setFormData({ ...formData, annual_fee: parseFloat(e.target.value) || 0 })}
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
              placeholder="0"
            />
          </div>
        </div>

        {/* Anniversary Date */}
        <div>
          <label htmlFor="card-anniversary" className="block text-sm font-medium text-gray-700 mb-1">
            Anniversary Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            id="card-anniversary"
            required
            value={formData.anniversary_date}
            onChange={(e) => setFormData({ ...formData, anniversary_date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
          />
        </div>

        {/* Reset Mode */}
        <div>
          <label htmlFor="card-reset-mode" className="block text-sm font-medium text-gray-700 mb-1">
            Perk Reset Mode <span className="text-red-500">*</span>
          </label>
          <select
            id="card-reset-mode"
            required
            value={formData.reset_mode}
            onChange={(e) => setFormData({ ...formData, reset_mode: e.target.value as ResetMode })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
          >
            <option value="calendar_year">Calendar Year (Jan-Dec)</option>
            <option value="anniversary">Anniversary Date</option>
          </select>
        </div>

        {/* Archived (only for editing) */}
        {initialData && (
          <div className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              id="card-archived"
              checked={formData.archived}
              onChange={(e) => setFormData({ ...formData, archived: e.target.checked })}
              className="w-4 h-4 text-accent-terracotta border-gray-300 rounded focus:ring-accent-terracotta"
            />
            <label htmlFor="card-archived" className="text-sm font-medium text-gray-700">
              Archived (hidden from main view)
            </label>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="card-notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="card-notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
          placeholder="Optional notes about this card..."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="credit-card-form-submit"
          className="px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            initialData ? 'Update Card' : 'Add Card'
          )}
        </button>
      </div>
    </form>
  );
}
