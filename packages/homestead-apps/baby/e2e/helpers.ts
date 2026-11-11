/**
 * Baby log seed helpers — babies and their events, straight through the
 * shared client.
 */

import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

export interface BabyRecord {
  id: string;
  path: string;
  name: string;
  birth_date?: string;
}

export interface BabyEventRecord {
  id: string;
  path: string;
  kind: 'feed' | 'diaper' | 'sleep';
  started_at?: string;
  ended_at?: string;
  feed_method?: 'breast' | 'bottle';
  side?: 'left' | 'right' | 'both';
  amount?: number;
  amount_unit?: 'oz' | 'ml';
  contents?: 'breast_milk' | 'formula';
  diaper?: 'wet' | 'dirty' | 'both';
  notes?: string;
  created_by?: string;
}

export type BabyEventInput = Omit<BabyEventRecord, 'id' | 'path'>;

export async function createBaby(
  token: string,
  data: { name: string; birth_date?: string } = { name: 'Juniper' },
): Promise<BabyRecord> {
  return e2eClient(token).collection<BabyRecord>('babies').create(data);
}

function events(token: string, babyId: string) {
  return e2eClient(token).collection('babies').record(babyId).collection<BabyEventRecord>('baby-events');
}

export async function createBabyEvent(
  token: string,
  babyId: string,
  data: BabyEventInput,
): Promise<BabyEventRecord> {
  return events(token, babyId).create(data);
}

/** A baby's events, oldest first. */
export async function listBabyEvents(token: string, babyId: string): Promise<BabyEventRecord[]> {
  const all = await events(token, babyId).listAll();
  return all.sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''));
}

/**
 * An instant `minutes` before now, as the app stores one. An entry that has to
 * show on today's timeline should be seconds old (`minutesAgo(0.01)`), so the
 * spec holds just after midnight too.
 */
export function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}
