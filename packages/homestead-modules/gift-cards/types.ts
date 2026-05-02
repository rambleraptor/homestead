/**
 * Gift Card Module Types
 */

/**
 * Gift Card record from aepbase.
 *
 * `created_by` holds an aepbase resource path (`users/{user_id}`), not a bare
 * id like PocketBase used to. `create_time`/`update_time` are aepbase's
 * standard timestamps (PocketBase used `created`/`updated`).
 */
export interface GiftCard {
  id: string;
  path: string;
  merchant: string;
  card_number: string;
  pin?: string;
  amount: number;
  notes?: string;
  front_image?: string;
  back_image?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
  archived?: boolean;
}

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

/**
 * Transaction type
 */
export type TransactionType = 'decrement' | 'set';

/**
 * Gift Card Transaction record from aepbase.
 *
 * Transactions are a child of gift-cards in aepbase, so the parent id is
 * encoded in the URL path (`/gift-cards/{id}/transactions/{id}`) rather than
 * stored as a foreign-key field. The PocketBase-era `gift_card` field is
 * gone; callers identify the parent via the URL.
 */
export interface GiftCardTransaction {
  id: string;
  path: string;
  transaction_type: TransactionType;
  previous_amount: number;
  new_amount: number;
  amount_changed: number;
  notes?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

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
