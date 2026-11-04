/**
 * Credit Cards E2E helpers — seed cards and their nested perks through the
 * shared client, so specs don't pay for the UI to set up their data.
 */

import { collectionAt } from '@rambleraptor/homestead-core/server/client';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

export interface CreditCardRecord {
  id: string;
  name: string;
  issuer: string;
  annual_fee: number;
  anniversary_date: string;
  reset_mode: 'calendar_year' | 'anniversary';
  archived?: boolean;
}

export interface PerkRecord {
  id: string;
  name: string;
  value: number;
  frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
}

export async function createCreditCard(
  token: string,
  data: {
    name: string;
    issuer?: string;
    annual_fee?: number;
    anniversary_date?: string;
    reset_mode?: 'calendar_year' | 'anniversary';
    archived?: boolean;
  },
): Promise<CreditCardRecord> {
  return e2eClient(token).collection<CreditCardRecord>('credit-cards').create({
    name: data.name,
    issuer: data.issuer ?? 'Test Bank',
    annual_fee: data.annual_fee ?? 95,
    anniversary_date: data.anniversary_date ?? '2020-01-15',
    reset_mode: data.reset_mode ?? 'calendar_year',
    archived: data.archived ?? false,
  });
}

export async function createPerk(
  token: string,
  cardId: string,
  data: { name: string; value: number; frequency?: PerkRecord['frequency'] },
): Promise<PerkRecord> {
  return collectionAt<PerkRecord>(e2eClient(token), 'perks', ['credit-cards', cardId]).create({
    name: data.name,
    value: data.value,
    frequency: data.frequency ?? 'monthly',
  });
}
