/**
 * Charitable Receipts Types
 *
 * Donations to charity, kept for the year-end deduction total.
 */

/** How the gift was made. `Other` covers stock, mileage, and crypto for now. */
export type GiftType = 'Cash' | 'Goods' | 'Other';

/**
 * Who paid: the donor directly, or a donor-advised fund. A DAF grant isn't
 * deductible — the deduction belongs to the contribution into the fund.
 */
export type DonationSource = 'Self' | 'DAF';

/** Whether the donation has gone onto a filed return yet. */
export type CharitableStatus = 'Unclaimed' | 'Claimed';

export interface CharitableReceipt {
  id: string;
  organization: string;
  organization_ein?: string;
  donation_date: string;
  /** The year claimed against; falls back to the donation date's year. */
  tax_year?: number;
  gift_type: GiftType;
  /** Absent on receipts that predate the field; read as `Self`. */
  source?: DonationSource;
  /** Absent on a goods gift nobody has valued yet. */
  amount?: number;
  /** Stated value of goods/services received back; reduces the deduction. */
  value_received?: number;
  description_of_property?: string;
  goods_or_services?: string;
  donor?: string;
  /** Canonical link to a `person` record, as a `people/{id}` path. */
  person?: string;
  status: CharitableStatus;
  /** Absent when the receipt links to a source document instead of its own file. */
  receipt_file?: string;
  /** `documents/{id}` this receipt was derived from; holds the file in place of `receipt_file`. */
  source_document?: string;
  notes?: string;
  created_by?: string;
  created: string;
  updated: string;
}

/** Form data for creating/updating a charitable receipt. */
export interface CharitableReceiptFormData {
  organization: string;
  organization_ein?: string;
  donation_date: string;
  tax_year?: number;
  gift_type: GiftType;
  source?: DonationSource;
  amount?: number;
  value_received?: number;
  description_of_property?: string;
  goods_or_services?: string;
  donor?: string;
  person?: string;
  status: CharitableStatus;
  receipt_file?: File;
  notes?: string;
}

/** One year's giving, as the by-year table and the year picker read it. */
export interface YearSummary {
  year: number;
  /** Deductible total across every gift type. */
  total: number;
  cash: number;
  /** Non-cash: `Goods` and `Other` together — what isn't a cash gift. */
  nonCash: number;
  count: number;
}

/** One organization's share of a year, for the breakdown bars. */
export interface OrganizationBreakdown {
  organization: string;
  total: number;
  count: number;
}

/** Everything the charitable tab renders for the selected year. */
export interface CharitableStats {
  /** The year these figures describe. */
  year: number;
  /** Deductible total for the year: sum of `amount - value_received`. */
  total: number;
  cash: number;
  nonCash: number;
  count: number;
  cashCount: number;
  nonCashCount: number;
  /** Gifts of goods with no value entered yet — they count for nothing until they have one. */
  unvalued: number;
  /** Granted from a donor-advised fund: tracked, but not part of `total`. */
  dafGranted: number;
  dafCount: number;
  /** Gifts of $250 or more with no acknowledgment file or source document. */
  missingAcknowledgment: number;
  organizationBreakdown: OrganizationBreakdown[];
  /** Every year with data, newest first. Drives the picker and the by-year table. */
  years: YearSummary[];
}
