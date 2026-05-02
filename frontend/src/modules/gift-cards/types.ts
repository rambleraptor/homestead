/**
 * Gift Card Module Types
 *
 * `GiftCard` and `GiftCardTransaction` are derived from the
 * `AepResourceDefinition`s in `./resources.ts` — change a field there
 * and the TS type updates everywhere automatically. See
 * `@/core/aep/derive-type` for how `AepRecord<>` works (binary fields
 * become URL strings on read; `id`/`path`/`create_time`/`update_time`
 * come from the aepbase envelope; `enums` map entries become
 * string-literal unions).
 *
 * Form-data shapes (`*FormData`) stay hand-written: file fields are
 * `File | null` on write but `string` URLs on read, and we don't try
 * to derive both from one schema.
 */

import type { AepRecord } from '../../core/aep/derive-type';
import type {
  giftCardResource,
  giftCardTransactionResource,
} from './resources';

export type GiftCard = AepRecord<typeof giftCardResource>;

/**
 * Form data for creating/updating gift cards
 */
export interface GiftCardFormData {
  merchant: string;
  card_number: string;
  pin?: string;
  amount: number;
  notes?: string;
  front_image?: File | null;
  back_image?: File | null;
}

export type GiftCardTransaction = AepRecord<typeof giftCardTransactionResource>;

/** Allowed values for `GiftCardTransaction.transaction_type`. */
export type TransactionType = GiftCardTransaction['transaction_type'];

/**
 * Form data for creating transactions
 */
export interface TransactionFormData {
  transaction_type: TransactionType;
  amount: number;
  notes?: string;
}

/**
 * Merchant summary with total amount
 */
export interface MerchantSummary {
  merchant: string;
  totalAmount: number;
  cardCount: number;
  cards: GiftCard[];
  archived?: boolean;
}

/**
 * Gift card statistics
 */
export interface GiftCardStats {
  totalCards: number;
  totalAmount: number;
  merchantCount: number;
  merchants: MerchantSummary[];
}
