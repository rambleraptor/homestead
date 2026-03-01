/**
 * Credit Card Rewards Tracker Types
 */

/**
 * Card type
 */
export type CardType = 'personal' | 'business';

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
 * Credit Card record from PocketBase
 */
export interface CreditCard {
  id: string;
  name: string;
  issuer: string;
  last_four?: string;
  card_type: CardType;
  annual_fee: number;
  anniversary_date: string;
  reset_mode: ResetMode;
  notes?: string;
  archived: boolean;
  created_by?: string;
  created: string;
  updated: string;
}

/**
 * Form data for creating/updating credit cards
 */
export interface CreditCardFormData {
  name: string;
  issuer: string;
  last_four?: string;
  card_type: CardType;
  annual_fee: number;
  anniversary_date: string;
  reset_mode: ResetMode;
  notes?: string;
  archived?: boolean;
}

/**
 * Credit Card Perk record from PocketBase
 */
export interface CreditCardPerk {
  id: string;
  credit_card: string;
  name: string;
  value: number;
  frequency: PerkFrequency;
  category?: PerkCategory;
  notes?: string;
  created_by?: string;
  created: string;
  updated: string;
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
 * Perk Redemption record from PocketBase
 */
export interface PerkRedemption {
  id: string;
  perk: string;
  period_start: string;
  period_end: string;
  redeemed_at: string;
  amount: number;
  notes?: string;
  created_by?: string;
  created: string;
  updated: string;
}

/**
 * Form data for creating redemptions
 */
export interface RedemptionFormData {
  perk: string;
  period_start: string;
  period_end: string;
  redeemed_at: string;
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
