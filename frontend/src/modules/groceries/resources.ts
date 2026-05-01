/**
 * aepbase resource definitions for the groceries module.
 *
 * Source of truth — synced to aepbase by
 * `frontend/scripts/apply-schema.ts`. Equivalent to
 * `aepbase/terraform/groceries.tf`.
 */

import type { AepResourceDefinition } from '../../core/aep/types';

const store: AepResourceDefinition = {
  singular: 'store',
  plural: 'stores',
  description: 'A grocery store (used to group grocery items).',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      sort_order: { type: 'number' },
      created_by: { type: 'string' },
    },
    required: ['name'],
  },
};

const grocery: AepResourceDefinition = {
  singular: 'grocery',
  plural: 'groceries',
  description: "A single item on the household's shared grocery list.",
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      checked: { type: 'boolean' },
      category: { type: 'string' },
      notes: { type: 'string' },
      store: { type: 'string', description: 'stores/{store_id}' },
      created_by: { type: 'string' },
    },
    required: ['name'],
  },
};

export const groceriesResources: AepResourceDefinition[] = [store, grocery];
