/**
 * Gift Cards Bulk Import - Field Validators
 */

import type { FieldValidator } from '@/shared/bulk-import';

/**
 * Validates merchant field
 */
export const validateMerchant: FieldValidator<string> = (value) => {
  const merchant = value.trim();

  if (merchant.length > 200) {
    return {
      value: merchant,
      error: 'merchant must be 200 characters or less',
    };
  }

  return { value: merchant };
};

/**
 * Validates card_number field
 */
export const validateCardNumber: FieldValidator<string> = (value) => {
  const cardNumber = value.trim();

  if (cardNumber.length > 100) {
    return {
      value: cardNumber,
      error: 'card_number must be 100 characters or less',
    };
  }

  return { value: cardNumber };
};

/**
 * Validates pin field
 */
export const validatePin: FieldValidator<string | undefined> = (value) => {
  const pin = value.trim();

  if (!pin) {
    return { value: undefined };
  }

  if (pin.length > 50) {
    return {
      value: pin,
      error: 'pin must be 50 characters or less',
    };
  }

  return { value: pin };
};

/**
 * Validates amount field
 */
export const validateAmount: FieldValidator<number> = (value) => {
  const amountStr = value.trim();

  // Remove currency symbols and commas
  const cleanedAmount = amountStr.replace(/[$,]/g, '');

  const amount = parseFloat(cleanedAmount);

  if (isNaN(amount)) {
    return {
      value: 0,
      error: 'amount must be a valid number',
    };
  }

  if (amount < 0) {
    return {
      value: amount,
      error: 'amount must be greater than or equal to 0',
    };
  }

  // Round to 2 decimal places
  const roundedAmount = Math.round(amount * 100) / 100;

  return { value: roundedAmount };
};

/**
 * Validates notes field
 */
export const validateNotes: FieldValidator<string | undefined> = (value) => {
  const notes = value.trim();

  if (!notes) {
    return { value: undefined };
  }

  if (notes.length > 2000) {
    return {
      value: notes,
      error: 'notes must be 2000 characters or less',
    };
  }

  return { value: notes };
};

/**
 * Validates archived field
 */
export const validateArchived: FieldValidator<boolean> = (value) => {
  const archivedValue = value.toLowerCase().trim();

  if (
    archivedValue === 'false' ||
    archivedValue === 'no' ||
    archivedValue === '0' ||
    archivedValue === ''
  ) {
    return { value: false };
  }

  if (
    archivedValue === 'true' ||
    archivedValue === 'yes' ||
    archivedValue === '1'
  ) {
    return { value: true };
  }

  return {
    value: false,
    error: 'archived must be "true", "false", "yes", "no", "1", or "0"',
  };
};
