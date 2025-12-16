/**
 * Utility functions for building gift card FormData
 */

import type { GiftCardFormData } from '../types';

interface BuildGiftCardFormDataOptions {
  data: GiftCardFormData;
  createdBy?: string;
  archived?: boolean;
}

/**
 * Builds FormData for gift card create/update operations
 * @param options - Configuration including form data, user ID, and archived status
 * @returns FormData object ready for PocketBase
 */
export function buildGiftCardFormData({
  data,
  createdBy,
  archived,
}: BuildGiftCardFormDataOptions): FormData {
  const formData = new FormData();

  formData.append('merchant', data.merchant);
  formData.append('card_number', data.card_number);
  if (data.pin) formData.append('pin', data.pin);
  formData.append('amount', data.amount.toString());
  if (data.notes) formData.append('notes', data.notes);
  if (createdBy) formData.append('created_by', createdBy);
  if (archived !== undefined) formData.append('archived', archived.toString());

  if (data.front_image) {
    formData.append('front_image', data.front_image);
  }
  if (data.back_image) {
    formData.append('back_image', data.back_image);
  }

  return formData;
}

/**
 * Builds plain object for gift card create/update when no files are present
 * @param options - Configuration including form data, user ID, and archived status
 * @returns Plain object ready for PocketBase
 */
export function buildGiftCardData({
  data,
  createdBy,
  archived,
}: BuildGiftCardFormDataOptions) {
  return {
    merchant: data.merchant,
    card_number: data.card_number,
    pin: data.pin,
    amount: data.amount,
    notes: data.notes,
    ...(createdBy && { created_by: createdBy }),
    ...(archived !== undefined && { archived }),
  };
}
