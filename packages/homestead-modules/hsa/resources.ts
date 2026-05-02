import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const hsaResources: ResourceDefinition[] = [
  {
    singular: 'hsa-receipt',
    plural: 'hsa-receipts',
    description:
      'A receipt for an HSA-eligible expense (for later reimbursement tracking).',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        merchant: { type: 'string' },
        service_date: { type: 'string', format: 'date-time' },
        amount: { type: 'number' },
        category: {
          type: 'string',
          description: 'one of: Medical, Dental, Vision, Rx',
        },
        patient: { type: 'string' },
        status: {
          type: 'string',
          description: 'one of: Stored, Reimbursed',
        },
        receipt_file: {
          type: 'binary',
          'x-aepbase-file-field': true,
          description: 'Receipt file (jpeg/png/webp/gif/pdf, <=10MB)',
        },
        notes: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: [
        'merchant',
        'service_date',
        'amount',
        'category',
        'status',
        'receipt_file',
      ],
    },
  },
];
