import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const groceriesResources: ResourceDefinition[] = [
  {
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
  },
  {
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
  },
];
