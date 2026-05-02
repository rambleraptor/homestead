import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const giftCardsResources: ResourceDefinition[] = [
  {
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
  },
  {
    singular: 'transaction',
    plural: 'transactions',
    description: 'A balance change recorded against a gift card.',
    user_settable_create: true,
    parents: ['gift-card'],
    schema: {
      type: 'object',
      properties: {
        transaction_type: {
          type: 'string',
          description: 'one of: decrement, set',
        },
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
  },
];
