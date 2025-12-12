/**
 * Gift Card Form Component
 *
 * Form for creating and editing gift cards
 */

import { useState } from 'react';
import { Save, X } from 'lucide-react';
import type { GiftCard, GiftCardFormData } from '../types';

interface GiftCardFormProps {
  onSubmit: (data: GiftCardFormData) => void;
  onCancel: () => void;
  initialData?: GiftCard;
  isSubmitting?: boolean;
}

export function GiftCardForm({
  onSubmit,
  onCancel,
  initialData,
  isSubmitting = false,
}: GiftCardFormProps) {
  const [formData, setFormData] = useState<GiftCardFormData>({
    merchant: initialData?.merchant || '',
    card_number: initialData?.card_number || '',
    pin: initialData?.pin || '',
    amount: initialData?.amount || 0,
    notes: initialData?.notes || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'amount' ? parseFloat(value) || 0 : value,
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Merchant */}
      <div>
        <label
          htmlFor="merchant"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Merchant <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="merchant"
          name="merchant"
          value={formData.merchant}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          placeholder="e.g., Amazon, Starbucks, Target"
        />
      </div>

      {/* Card Number */}
      <div>
        <label
          htmlFor="card_number"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Card Number <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="card_number"
          name="card_number"
          value={formData.card_number}
          onChange={handleChange}
          required
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
          placeholder="Enter card number"
        />
      </div>

      {/* PIN */}
      <div>
        <label
          htmlFor="pin"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          PIN
        </label>
        <input
          type="text"
          id="pin"
          name="pin"
          value={formData.pin}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono"
          placeholder="Enter PIN (optional)"
        />
      </div>

      {/* Amount */}
      <div>
        <label
          htmlFor="amount"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Amount <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-gray-500 dark:text-gray-400">
            $
          </span>
          <input
            type="number"
            id="amount"
            name="amount"
            value={formData.amount}
            onChange={handleChange}
            required
            min="0"
            step="0.01"
            className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
        >
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
          placeholder="Any additional notes (optional)"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
        >
          <Save className="w-4 h-4" />
          {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Add Card'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
