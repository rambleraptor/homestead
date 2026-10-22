/**
 * A charity's receipt or acknowledgment letter for a donation.
 *
 * See form-1099-int.ts for the authoring notes; the same rules apply.
 *
 * Not an IRS form — a letter or receipt from the charity, so its wording varies
 * far more than a numbered-box form does. It earns its place because a gift of
 * $250 or more cannot be deducted without a written acknowledgment, and that
 * acknowledgment has to state whether anything was received in return, which is
 * why `goods_or_services` is extracted rather than assumed.
 */

import type { DocType } from './docType';

const charitableDonationReceipt: DocType = {
  id: 'charitable-donation-receipt',
  label: 'Charitable donation receipt',
  icon: () => import('lucide-react').then((m) => m.HandHeart),
  category: 'tax',
  // On a match, mirror the donation into the Receipts app (server-only hook).
  post_classify: () => import('./post-classify/charitable-donation-receipt.server'),
  title_template: 'Donation ({tax_year}) — {organization_name}',
  description:
    'A receipt or written acknowledgment from a charity for a donation — cash or ' +
    'goods. Usually a letter or emailed receipt thanking the donor and stating ' +
    'the amount or a description of what was given, often with the charity\'s ' +
    'tax-exempt status and EIN, and a line about whether any goods or services ' +
    'were provided in return. Not an IRS form and not a shop receipt for a ' +
    'purchase.',
  fields: {
    organization_name: {
      label: 'Organization',
      type: 'string',
      description: 'The charity that received the donation and issued the receipt.',
    },
    organization_ein: {
      label: "Organization's EIN",
      type: 'string',
      description:
        "The charity's Employer Identification Number, if printed. Often shown " +
        'beside a line about 501(c)(3) status.',
    },
    donor_name: {
      label: 'Donor',
      type: 'string',
      person: true,
      description: 'The donor the receipt is addressed to.',
    },
    donor_advised_fund: {
      label: 'Donor-advised fund',
      type: 'string',
      description:
        'The name of the donor-advised fund the gift was granted from, when the ' +
        'acknowledgment says it came from one — e.g. "Fidelity Charitable", ' +
        '"Schwab Charitable", "Vanguard Charitable", or a community foundation ' +
        'fund ("the Smith Family Fund at …"). Omit when the donor paid directly.',
    },
    donation_date: {
      label: 'Donation date',
      type: 'string',
      description:
        'The date the gift was made. Use the donation date, not the date the ' +
        'letter was written, when the two differ.',
    },
    donation_amount: {
      label: 'Amount',
      type: 'number',
      description:
        'The cash amount donated. Omit for a gift of goods, where the charity ' +
        'describes the items but does not value them.',
    },
    description_of_property: {
      label: 'Donated goods',
      type: 'string',
      description:
        'What was given, for a non-cash gift — e.g. "3 bags of clothing". A ' +
        'charity describes donated goods but does not put a value on them.',
    },
    goods_or_services: {
      label: 'Goods or services received',
      type: 'string',
      description:
        'What the acknowledgment says the donor got back. Usually a line reading ' +
        '"no goods or services were provided in exchange"; if something was ' +
        'provided, record its description and stated value. Required wording on ' +
        'gifts of $250 or more.',
    },
    tax_year: {
      label: 'Tax year',
      type: 'number',
      description:
        'The tax year the donation falls in, as a four-digit year (e.g. 2024). ' +
        'Take it from the donation date when not stated outright.',
    },
  },
};

export default charitableDonationReceipt;
