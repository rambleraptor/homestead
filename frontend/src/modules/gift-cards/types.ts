/**
 * Gift Card Module Types
 */

/**
 * Gift Card record from PocketBase
 */
export interface GiftCard {
  id: string;
  merchant: string;
  card_number: string;
  pin?: string;
  amount: number;
  notes?: string;
  front_image?: string;
  back_image?: string;
  created_by?: string;
  created: string;
  updated: string;
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
 * Gift Card Transaction record from PocketBase
 */
export interface GiftCardTransaction {
  id: string;
  gift_card: string;
  transaction_type: TransactionType;
  previous_amount: number;
  new_amount: number;
  amount_changed: number;
  notes?: string;
  created_by?: string;
  created: string;
  updated: string;
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
 * Merchant record from PocketBase
 */
export interface Merchant {
  id: string;
  name: string;
  domain?: string;
  logo_url?: string;
  created: string;
  updated: string;
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
  logo_url?: string;
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
