/**
 * Gift Cards Bulk Import - Schema Definition
 */

import type { BulkImportSchema } from '@/shared/bulk-import';
import {
  validateMerchant,
  validateCardNumber,
  validatePin,
  validateAmount,
  validateNotes,
  validateArchived,
} from './validators';
import { GiftCardPreview } from './GiftCardPreview';

/**
 * Gift card import data type
 * (excludes front_image and back_image which aren't supported in CSV import)
 */
export interface GiftCardImportData {
  merchant: string;
  card_number: string;
  pin?: string;
  amount: number;
  notes?: string;
  archived?: boolean;
}

/**
 * CSV headers for gift cards import
 */
const REQUIRED_HEADERS = ['merchant', 'card_number', 'amount'] as const;

const OPTIONAL_HEADERS = ['pin', 'notes', 'archived'] as const;

const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS] as const;

/**
 * Generate CSV template for gift cards
 */
function generateTemplate(): string {
  const headers = ALL_HEADERS.join(',');
  const example1 = 'Amazon,$100.00 Gift Card,1234-5678-9012,100.00,Birthday gift from Mom,false';
  const example2 = 'Starbucks,Coffee Lovers Card,9876-5432,25.50,"For daily coffee runs",false';
  const example3 = 'Target,Target Gift Card,4455-6677-8899-0011,,50.00,false';

  return `${headers}\n${example1}\n${example2}\n${example3}`;
}

/**
 * Gift cards bulk import schema
 *
 * Note: front_image and back_image are not supported in CSV import
 * since they require file uploads
 */
export const giftCardsImportSchema: BulkImportSchema<GiftCardImportData> = {
  requiredFields: [
    {
      name: 'merchant',
      required: true,
      validator: validateMerchant,
      description: 'Merchant name (max 200 characters)',
    },
    {
      name: 'card_number',
      required: true,
      validator: validateCardNumber,
      description: 'Card number or identifier (max 100 characters)',
    },
    {
      name: 'amount',
      required: true,
      validator: validateAmount,
      description: 'Card balance/amount (numeric, e.g., 50.00 or $50.00)',
    },
  ],
  optionalFields: [
    {
      name: 'pin',
      required: false,
      validator: validatePin,
      description: 'Card PIN (max 50 characters)',
    },
    {
      name: 'notes',
      required: false,
      validator: validateNotes,
      description: 'Additional notes (max 2000 characters)',
    },
    {
      name: 'archived',
      required: false,
      validator: validateArchived,
      defaultValue: false,
      description: 'Whether card is archived: "true" or "false" (default: false)',
    },
  ],
  generateTemplate,
  PreviewComponent: GiftCardPreview,
};
