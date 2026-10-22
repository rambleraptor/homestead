import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const CHARITABLE_RECEIPTS = 'charitable-receipts' as const;

export const charitableResources: ResourceDefinition[] = [
  {
    singular: 'charitable-receipt',
    plural: CHARITABLE_RECEIPTS,
    description:
      "A charity's receipt or written acknowledgment for a donation, kept for " +
      'the year-end deduction total.',
    user_settable_create: true,
    fields: {
      organization: { type: 'string', required: true },
      // Printed on most acknowledgments beside the 501(c)(3) line. Worth its own
      // column because two chapters of a national charity share a name but not
      // an EIN, and it's what you'd check against the IRS exempt-org list.
      organization_ein: { type: 'string' },
      donation_date: { type: 'string', format: 'date-time', required: true },
      // The year the deduction is claimed against. Stored *and* optional: a
      // check mailed in late December is acknowledged for the year it was sent,
      // not the year the letter is dated, so the receipt sometimes says which
      // year it counts for — and when it doesn't, the stats fall back to the
      // donation date's year (see `stats.ts`).
      tax_year: { type: 'number' },
      gift_type: {
        type: 'string',
        enum: ['Cash', 'Goods', 'Other'],
        required: true,
        // What almost every donation is; also what the documents hook infers
        // when the acknowledgment states an amount.
        default: 'Cash',
      },
      // Where the money came from. A grant out of a donor-advised fund is not
      // deductible — the deduction was taken when the fund was contributed to —
      // so a DAF gift is tracked but left out of the year's deduction total.
      // Optional so rows that predate it read as Self.
      source: {
        type: 'string',
        enum: ['Self', 'DAF'],
        default: 'Self',
        description: 'Who made the gift: Self (paid directly) or DAF (granted from a donor-advised fund).',
      },
      // What you're claiming. Deliberately *not* required: a charity describes
      // donated goods but never puts a value on them, so a goods receipt lands
      // here unvalued and the UI asks its owner for a number.
      amount: { type: 'number', exclusiveMinimum: 0 },
      // Stated value of anything the donor received back (a gala dinner, a tote
      // bag). Only the excess over this is deductible.
      value_received: { type: 'number', minimum: 0 },
      description_of_property: {
        type: 'string',
        description: 'What was given, for a non-cash gift — e.g. "3 bags of clothing".',
      },
      // The acknowledgment's own wording, kept verbatim: a gift of $250 or more
      // isn't deductible without a statement of what, if anything, was received
      // in return.
      goods_or_services: { type: 'string' },
      // Free-text name as printed on the receipt, and the canonical link to a
      // `person` record — the same pair, for the same reason, as `patient` /
      // `person` on an hsa-receipt.
      donor: { type: 'string' },
      person: {
        type: 'string',
        reference: { resource: 'person', onDelete: 'set-null' },
      },
      status: {
        type: 'string',
        enum: ['Unclaimed', 'Claimed'],
        required: true,
        // Claimed once it's gone onto a filed return. Declared as a schema
        // default so every create path lands on Unclaimed without setting it.
        default: 'Unclaimed',
      },
      // Optional, exactly as on an hsa-receipt: a receipt captured by hand
      // carries its own file, one created from a classified document links back
      // via `source_document` instead.
      receipt_file: {
        type: 'file',
        description: 'Acknowledgment file (jpeg/png/webp/gif/pdf, <=10MB)',
      },
      source_document: {
        type: 'string',
        description: 'Path of the source document this receipt was derived from.',
      },
      notes: { type: 'string' },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
];
