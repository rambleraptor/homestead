/**
 * Gift Cards E2E helpers — seed data via the aepbase REST API and shared
 * test fixtures used by gift-card specs.
 */

import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

interface CreateGiftCardInput {
  merchant: string;
  amount: number;
  card_number?: string;
  pin?: string;
  notes?: string;
}

export interface GiftCardRecord {
  id: string;
  merchant: string;
  amount: number;
  card_number: string;
  pin?: string;
  notes?: string;
}

export async function createGiftCard(
  token: string,
  data: CreateGiftCardInput,
): Promise<GiftCardRecord> {
  return e2eClient(token).collection<GiftCardRecord>('gift-cards').create({
    merchant: data.merchant,
    amount: data.amount,
    card_number:
      data.card_number ||
      `TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    pin: data.pin || '',
    notes: data.notes || '',
  });
}

export async function createMultipleGiftCards(
  token: string,
  cards: Array<CreateGiftCardInput>,
) {
  const results = [];
  for (const card of cards) {
    results.push(await createGiftCard(token, card));
  }
  return results;
}

export const testGiftCards = [
  {
    merchant: 'Amazon',
    card_number: '1234-5678-9012-3456',
    amount: 50.0,
    notes: 'Birthday gift',
  },
  {
    merchant: 'Starbucks',
    card_number: '2345-6789-0123-4567',
    amount: 25.0,
    notes: 'Coffee gift card',
  },
  {
    merchant: 'Target',
    card_number: '3456-7890-1234-5678',
    amount: 100.0,
    notes: 'Holiday shopping',
  },
  {
    merchant: 'Amazon',
    card_number: '4567-8901-2345-6789',
    amount: 30.0,
    notes: 'Another Amazon card',
  },
];
