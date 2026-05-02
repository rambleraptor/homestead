/**
 * aepbase resource definitions for the gift-cards module.
 *
 * Source of truth — synced to aepbase by
 * `frontend/scripts/apply-schema.ts`. Equivalent to
 * `aepbase/terraform/gift_cards.tf`.
 *
 * Each resource is declared with `as const satisfies
 * AepResourceDefinition` so that:
 *   - the literal types survive into `typeof` for `AepRecord<>`-based
 *     type derivation in `./types.ts`;
 *   - the `satisfies` clause still type-checks the shape against
 *     `AepResourceDefinition`.
 */

import type { AepResourceDefinition } from '../../core/aep/types';

export const giftCardResource = {
  singular: 'gift-card',
  plural: 'gift-cards',
  description: 'A stored-value gift card owned by the household.',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: {
      merchant: { type: 'string' },
      card_number: { type: 'string' },
      pin: { type: 'string' },
      amount: { type: 'number' },
      notes: { type: 'string' },
      archived: { type: 'boolean' },
      front_image: {
        type: 'binary',
        'x-aepbase-file-field': true,
        description: 'Front-of-card image (jpeg/png/webp/gif, <=5MB)',
      },
      back_image: {
        type: 'binary',
        'x-aepbase-file-field': true,
        description: 'Back-of-card image (jpeg/png/webp/gif, <=5MB)',
      },
      created_by: { type: 'string', description: 'users/{user_id}' },
    },
    required: ['merchant', 'card_number', 'amount'],
  },
} as const satisfies AepResourceDefinition;

export const giftCardTransactionResource = {
  singular: 'transaction',
  plural: 'transactions',
  description: 'A balance change recorded against a gift card.',
  user_settable_create: true,
  parents: ['gift-card'],
  enums: {
    transaction_type: ['decrement', 'set'],
  },
  schema: {
    type: 'object',
    properties: {
      transaction_type: { type: 'string' },
      previous_amount: { type: 'number' },
      new_amount: { type: 'number' },
      amount_changed: { type: 'number' },
      notes: { type: 'string' },
      created_by: { type: 'string' },
    },
    required: [
      'transaction_type',
      'previous_amount',
      'new_amount',
      'amount_changed',
    ],
  },
} as const satisfies AepResourceDefinition;

export const giftCardsResources = [
  giftCardResource,
  giftCardTransactionResource,
] as const satisfies readonly AepResourceDefinition[];
