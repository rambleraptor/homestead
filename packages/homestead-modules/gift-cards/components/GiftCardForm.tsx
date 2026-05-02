'use client';

/**
 * Gift Card Form Component
 *
 * Form for creating and editing gift cards
 */

import React, { useEffect, useState } from 'react';
import { Save, X, Upload, Trash2 } from 'lucide-react';
import type { GiftCard, GiftCardFormData } from '../types';
import { useGiftCardImageUrl } from '../hooks/useGiftCardImageUrl';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { validateImageFile } from '@rambleraptor/homestead-core/shared/utils/fileValidation';

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
  const toast = useToast();
  const [formData, setFormData] = useState<GiftCardFormData>({
    merchant: initialData?.merchant || '',
    card_number: initialData?.card_number || '',
    pin: initialData?.pin || '',
    amount: initialData?.amount ?? 0,
    notes: initialData?.notes || '',
    front_image: null,
    back_image: null,
  });

  // Track if amount has been set by user (to avoid showing 0 initially)
  const [amountTouched, setAmountTouched] = useState(!!initialData?.amount);

  // Image preview state is split between two sources:
  //  - the existing card's image, fetched via the backend-aware hook
  //    (synchronous PB URL or async aepbase blob URL);
  //  - any image the user has uploaded in this session, held as a blob URL.
  // Upload always wins; "remove" hides both for the current edit session
  // (matching the previous behavior — actual deletion still requires a save
  // that omits the field).
  const remoteFrontUrl = useGiftCardImageUrl(initialData ?? null, 'front_image');
  const remoteBackUrl = useGiftCardImageUrl(initialData ?? null, 'back_image');
  const [frontUploadUrl, setFrontUploadUrl] = useState<string | null>(null);
  const [backUploadUrl, setBackUploadUrl] = useState<string | null>(null);
  const [frontHidden, setFrontHidden] = useState(false);
  const [backHidden, setBackHidden] = useState(false);

  // Revoke blob URLs when the user replaces them or unmounts.
  useEffect(() => {
    return () => {
      if (frontUploadUrl) URL.revokeObjectURL(frontUploadUrl);
    };
  }, [frontUploadUrl]);
  useEffect(() => {
    return () => {
      if (backUploadUrl) URL.revokeObjectURL(backUploadUrl);
    };
  }, [backUploadUrl]);

  const frontImagePreview = frontUploadUrl ?? (frontHidden ? null : remoteFrontUrl);
  const backImagePreview = backUploadUrl ?? (backHidden ? null : remoteBackUrl);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    if (name === 'amount') {
      setAmountTouched(true);
      setFormData((prev) => ({
        ...prev,
        [name]: parseFloat(value) || 0,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    imageType: 'front_image' | 'back_image'
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file
      const validation = validateImageFile(file);
      if (!validation.valid) {
        toast.error(validation.error!);
        return;
      }

      setFormData((prev) => ({
        ...prev,
        [imageType]: file,
      }));

      const previewUrl = URL.createObjectURL(file);
      if (imageType === 'front_image') {
        setFrontUploadUrl(previewUrl);
        setFrontHidden(false);
      } else {
        setBackUploadUrl(previewUrl);
        setBackHidden(false);
      }
    }
  };

  const handleRemoveImage = (imageType: 'front_image' | 'back_image') => {
    setFormData((prev) => ({
      ...prev,
      [imageType]: null,
    }));

    if (imageType === 'front_image') {
      setFrontUploadUrl(null);
      setFrontHidden(true);
    } else {
      setBackUploadUrl(null);
      setBackHidden(true);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Merchant */}
      <div>
        <label
          htmlFor="merchant"
          className="block text-sm font-medium text-gray-700 mb-1"
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
          placeholder="e.g., Amazon, Starbucks, Target"
        />
      </div>

      {/* Card Number */}
      <div>
        <label
          htmlFor="card_number"
          className="block text-sm font-medium text-gray-700 mb-1"
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta font-mono"
          placeholder="Enter card number"
        />
      </div>

      {/* PIN */}
      <div>
        <label
          htmlFor="pin"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          PIN
        </label>
        <input
          type="text"
          id="pin"
          name="pin"
          value={formData.pin}
          onChange={handleChange}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta font-mono"
          placeholder="Enter PIN (optional)"
        />
      </div>

      {/* Amount */}
      <div>
        <label
          htmlFor="amount"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Amount <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2 text-gray-500">
            $
          </span>
          <input
            type="number"
            id="amount"
            name="amount"
            value={formData.amount === 0 && !amountTouched ? '' : formData.amount}
            onChange={handleChange}
            required
            min="0"
            step="0.01"
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
            placeholder="0.00"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta resize-none"
          placeholder="Any additional notes (optional)"
        />
      </div>

      {/* Card Images */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Front Image */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Front Image
          </label>
          {frontImagePreview ? (
            <div className="relative">
              <img
                src={frontImagePreview}
                alt="Front of gift card"
                className="w-full h-48 object-cover rounded-lg border border-gray-300"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage('front_image')}
                className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
                title="Remove image"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-accent-terracotta transition-colors">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-sm text-gray-500">
                Upload front image
              </span>
              <span className="text-xs text-gray-400 mt-1">
                (Optional, max 5MB)
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => handleImageChange(e, 'front_image')}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Back Image */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Back Image
          </label>
          {backImagePreview ? (
            <div className="relative">
              <img
                src={backImagePreview}
                alt="Back of gift card"
                className="w-full h-48 object-cover rounded-lg border border-gray-300"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage('back_image')}
                className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
                title="Remove image"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-accent-terracotta transition-colors">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-sm text-gray-500">
                Upload back image
              </span>
              <span className="text-xs text-gray-400 mt-1">
                (Optional, max 5MB)
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => handleImageChange(e, 'back_image')}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-6 border-t border-gray-200 mt-6">
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="gift-card-form-submit"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-terracotta hover:bg-accent-terracotta-hover disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors shadow-sm"
        >
          <Save className="w-4 h-4" />
          {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Add Card'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid="gift-card-form-cancel"
          className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50 shadow-sm"
        >
          <X className="w-4 h-4" />
          <span className="sr-only">Cancel</span>
        </button>
      </div>
    </form>
  );
}
