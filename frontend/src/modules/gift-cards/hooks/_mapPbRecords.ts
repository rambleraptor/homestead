/**
 * Compatibility mappers — translate PocketBase records into the aepbase-shaped
 * types that the rest of the gift-cards module consumes. This lets the
 * legacy PB code path live behind the same TypeScript surface as the new
 * aepbase code path, so components and tests don't have to know which
 * backend is currently active.
 *
 * Two key shape differences:
 *  - PB exposes timestamps as `created`/`updated`. aepbase uses
 *    `create_time`/`update_time`.
 *  - PB stores `created_by` as a bare user id. aepbase stores it as the
 *    full resource path `users/{id}`. We always present the prefixed form.
 */

import type { GiftCard, GiftCardTransaction, TransactionType } from '../types';

interface PbGiftCardRecord {
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

interface PbGiftCardTransactionRecord {
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

function withUserPrefix(rawId: string | undefined): string | undefined {
  if (!rawId) return undefined;
  return rawId.startsWith('users/') ? rawId : `users/${rawId}`;
}

export function mapPbGiftCard(rec: PbGiftCardRecord): GiftCard {
  return {
    id: rec.id,
    path: `gift-cards/${rec.id}`,
    merchant: rec.merchant,
    card_number: rec.card_number,
    pin: rec.pin,
    amount: rec.amount,
    notes: rec.notes,
    front_image: rec.front_image,
    back_image: rec.back_image,
    created_by: withUserPrefix(rec.created_by),
    create_time: rec.created,
    update_time: rec.updated,
    archived: rec.archived,
  };
}

export function mapPbTransaction(
  rec: PbGiftCardTransactionRecord,
): GiftCardTransaction {
  return {
    id: rec.id,
    path: `gift-cards/${rec.gift_card}/transactions/${rec.id}`,
    transaction_type: rec.transaction_type,
    previous_amount: rec.previous_amount,
    new_amount: rec.new_amount,
    amount_changed: rec.amount_changed,
    notes: rec.notes,
    created_by: withUserPrefix(rec.created_by),
    create_time: rec.created,
    update_time: rec.updated,
  };
}
