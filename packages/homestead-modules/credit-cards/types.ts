/**
 * Credit Card Rewards Tracker Types
 */

/**
 * Reset mode for perk periods
 */
export type ResetMode = 'calendar_year' | 'anniversary';

/**
 * Perk frequency
 */
export type PerkFrequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

/**
 * Perk category
 */
export type PerkCategory = 'travel' | 'dining' | 'streaming' | 'credits' | 'insurance' | 'lounge' | 'other';

/**
 * Credit Card record (aepbase-shaped). The PB code path maps PB records onto
 * this same shape via `_mapPbRecords` so consumers don't care which backend
 * served them.
 */
export interface CreditCard {
  id: string;
  path: string;
  name: string;
  issuer: string;
  last_four?: string;
  annual_fee: number;
  anniversary_date: string;
  reset_mode: ResetMode;
  notes?: string;
  archived: boolean;
  created_by?: string;
  create_time: string;
  update_time: string;
}

/**
 * Form data for creating/updating credit cards
 */
export interface CreditCardFormData {
  name: string;
  issuer: string;
  last_four?: string;
  annual_fee: number;
  anniversary_date: string;
  reset_mode: ResetMode;
  notes?: string;
  archived?: boolean;
}

/**
 * Credit Card Perk record. In aepbase, perks are a child of credit-cards
 * (URL: /credit-cards/{id}/perks/{id}) so the parent id isn't a stored
 * field — but we keep `credit_card` here populated by the mapper, because
 * the compute hooks (`useCreditCardStats`, `useUpcomingPerks`) join perks
 * to cards by this field.
 */
export interface CreditCardPerk {
  id: string;
  path: string;
  credit_card: string;
  name: string;
  value: number;
  frequency: PerkFrequency;
  category?: PerkCategory;
  notes?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

/**
 * Form data for creating/updating perks
 */
export interface PerkFormData {
  credit_card: string;
  name: string;
  value: number;
  frequency: PerkFrequency;
  category?: PerkCategory;
  notes?: string;
}

/**
 * Perk Redemption record. Two levels of nesting in aepbase
 * (`/credit-cards/{id}/perks/{id}/redemptions/{id}`) so the mapper populates
 * `perk` from the URL parent — same reason as `credit_card` on perks.
 */
export interface PerkRedemption {
  id: string;
  path: string;
  perk: string;
  period_start: string;
  period_end: string;
  amount: number;
  notes?: string;
  created_by?: string;
  create_time: string;
  update_time: string;
}

/**
 * Form data for creating redemptions
 */
export interface RedemptionFormData {
  perk: string;
  period_start: string;
  period_end: string;
  amount: number;
  notes?: string;
}

/**
 * Period boundary for a perk
 */
export interface PerkPeriod {
  start: Date;
  end: Date;
}

/**
 * Per-card computed stats
 */
export interface CardStats {
  cardId: string;
  annualFee: number;
  totalPerkValuePerYear: number;
  ytdRedeemed: number;
  coveragePercent: number;
  netValue: number;
}

/**
 * Overall dashboard stats
 */
export interface DashboardStats {
  totalAnnualFees: number;
  totalPerkValuePerYear: number;
  ytdRedeemed: number;
  overallCoveragePercent: number;
  netValue: number;
  cardStats: CardStats[];
}

/**
 * Upcoming perk (not yet redeemed for current period)
 */
export interface UpcomingPerk {
  perk: CreditCardPerk;
  card: CreditCard;
  currentPeriod: PerkPeriod;
  isRedeemed: boolean;
}
