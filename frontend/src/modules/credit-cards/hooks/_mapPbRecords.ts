/**
 * PocketBase → unified type mappers for the credit-cards module.
 */

import type {
  CreditCard,
  CreditCardPerk,
  PerkRedemption,
  ResetMode,
  PerkFrequency,
  PerkCategory,
} from '../types';

interface PbCreditCardRecord {
  id: string;
  name: string;
  issuer: string;
  last_four?: string;
  annual_fee: number;
  anniversary_date: string;
  reset_mode: ResetMode;
  notes?: string;
  archived: boolean;
  created_by?: string;
  created: string;
  updated: string;
}

interface PbPerkRecord {
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

interface PbRedemptionRecord {
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

function withUserPrefix(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return id.startsWith('users/') ? id : `users/${id}`;
}

export function mapPbCreditCard(rec: PbCreditCardRecord): CreditCard {
  return {
    id: rec.id,
    path: `credit-cards/${rec.id}`,
    name: rec.name,
    issuer: rec.issuer,
    last_four: rec.last_four,
    annual_fee: rec.annual_fee,
    anniversary_date: rec.anniversary_date,
    reset_mode: rec.reset_mode,
    notes: rec.notes,
    archived: rec.archived,
    created_by: withUserPrefix(rec.created_by),
    create_time: rec.created,
    update_time: rec.updated,
  };
}

export function mapPbPerk(rec: PbPerkRecord): CreditCardPerk {
  return {
    id: rec.id,
    path: `credit-cards/${rec.credit_card}/perks/${rec.id}`,
    credit_card: rec.credit_card,
    name: rec.name,
    value: rec.value,
    frequency: rec.frequency,
    category: rec.category,
    notes: rec.notes,
    created_by: withUserPrefix(rec.created_by),
    create_time: rec.created,
    update_time: rec.updated,
  };
}

export function mapPbRedemption(rec: PbRedemptionRecord): PerkRedemption {
  return {
    id: rec.id,
    // The PB record doesn't carry the credit-card id, so the path is the
    // partial nested form. Consumers only use `path` for display.
    path: `redemptions/${rec.id}`,
    perk: rec.perk,
    period_start: rec.period_start,
    period_end: rec.period_end,
    redeemed_at: rec.redeemed_at,
    amount: rec.amount,
    notes: rec.notes,
    created_by: withUserPrefix(rec.created_by),
    create_time: rec.created,
    update_time: rec.updated,
  };
}

export type PbCreditCardRow = PbCreditCardRecord;
export type PbPerkRow = PbPerkRecord;
export type PbRedemptionRow = PbRedemptionRecord;
