/**
 * Events E2E helpers — seed yearly-recurring household events via the
 * aepbase REST API.
 */

import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

export interface EventRecord {
  id: string;
  name: string;
  month: number;
  day: number;
  year?: number;
  tag?: string;
  people?: string[];
  recurrence?: 'yearly' | 'yearly-nth-weekday';
  recurrence_rule?: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

interface CreateEventInput {
  name: string;
  /** `YYYY-MM-DD`; split into month/day for the payload (year ignored unless `withYear`). */
  date: string;
  /** Set to also store the date's year as the origin year (for age tests). */
  withYear?: boolean;
  tag?: string;
  /** Pass bare ids; the `people/` prefix is added here. */
  personIds?: string[];
  recurrence?: 'yearly' | 'yearly-nth-weekday';
  recurrence_rule?: string;
}

/** Split a `YYYY-MM-DD` string into numeric parts. */
export function ymdParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.substring(0, 10).split('-').map(Number);
  return { year, month, day };
}

export async function createEvent(
  token: string,
  data: CreateEventInput,
): Promise<EventRecord> {
  const { year, month, day } = ymdParts(data.date);
  const payload: Record<string, unknown> = {
    name: data.name,
    month,
    day,
  };
  if (data.withYear) payload.year = year;
  if (data.tag) payload.tag = data.tag;
  if (data.personIds && data.personIds.length > 0) {
    payload.people = data.personIds.map((id) => `people/${id}`);
  }
  if (data.recurrence) payload.recurrence = data.recurrence;
  if (data.recurrence_rule) payload.recurrence_rule = data.recurrence_rule;
  return e2eClient(token).collection<EventRecord>('events').create(payload);
}

export async function listEvents(token: string): Promise<EventRecord[]> {
  return e2eClient(token).collection<EventRecord>('events').listAll();
}

