import type { GiftCardFormData } from '../types';

interface BuildOptions {
  data: GiftCardFormData;
  createdBy?: string;
  archived?: boolean;
}

export function buildGiftCardFormData({ data, createdBy, archived }: BuildOptions): FormData {
  const formData = new FormData();
  formData.append('merchant', data.merchant);
  formData.append('card_number', data.card_number);
  if (data.pin) formData.append('pin', data.pin);
  formData.append('amount', data.amount.toString());
  if (data.notes) formData.append('notes', data.notes);
  if (createdBy) formData.append('created_by', createdBy);
  if (archived !== undefined) formData.append('archived', archived.toString());
  if (data.front_image) formData.append('front_image', data.front_image);
  if (data.back_image) formData.append('back_image', data.back_image);
  return formData;
}

export function buildGiftCardData({ data, createdBy, archived }: BuildOptions) {
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
