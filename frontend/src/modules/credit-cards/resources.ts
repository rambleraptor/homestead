/**
 * aepbase resource definitions for the credit-cards module.
 *
 * Source of truth — synced to aepbase by
 * `frontend/scripts/apply-schema.ts`. Equivalent to
 * `aepbase/terraform/credit_cards.tf`.
 */

import type { AepResourceDefinition } from '../../core/aep/types';

const creditCard: AepResourceDefinition = {
  singular: 'credit-card',
  plural: 'credit-cards',
  description:
    'A credit card account tracked for annual-fee value analysis.',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      issuer: { type: 'string' },
      last_four: { type: 'string' },
      annual_fee: { type: 'number' },
      anniversary_date: { type: 'string', format: 'date-time' },
      reset_mode: {
        type: 'string',
        description: 'one of: calendar_year, anniversary',
      },
      notes: { type: 'string' },
      archived: { type: 'boolean' },
      created_by: { type: 'string' },
    },
    required: [
      'name',
      'issuer',
      'annual_fee',
      'anniversary_date',
      'reset_mode',
    ],
  },
};

const perk: AepResourceDefinition = {
  singular: 'perk',
  plural: 'perks',
  description:
    'A benefit/credit attached to a credit card (e.g. monthly dining credit).',
  user_settable_create: true,
  parents: ['credit-card'],
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      value: { type: 'number' },
      frequency: {
        type: 'string',
        description: 'one of: monthly, quarterly, semi_annual, annual',
      },
      category: {
        type: 'string',
        description:
          'one of: travel, dining, streaming, credits, insurance, lounge, other',
      },
      notes: { type: 'string' },
      created_by: { type: 'string' },
    },
    required: ['name', 'value', 'frequency'],
  },
};

const redemption: AepResourceDefinition = {
  singular: 'redemption',
  plural: 'redemptions',
  description:
    'A single redemption of a credit card perk during its validity window.',
  user_settable_create: true,
  parents: ['perk'],
  schema: {
    type: 'object',
    properties: {
      period_start: { type: 'string', format: 'date-time' },
      period_end: { type: 'string', format: 'date-time' },
      amount: { type: 'number' },
      notes: { type: 'string' },
      created_by: { type: 'string' },
    },
    required: ['period_start', 'period_end', 'amount'],
  },
};

export const creditCardsResources: AepResourceDefinition[] = [
  creditCard,
  perk,
  redemption,
];
