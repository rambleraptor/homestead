/**
 * Calendar E2E helpers — seed calendars and their events via the aepbase REST
 * API. Both are household-wide, so a regular member's token can write them.
 */

import { collectionAt } from '@rambleraptor/homestead-core/server/client';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

export interface CalendarRecord {
  id: string;
  name: string;
  color: string;
}

export interface CalendarEventRecord {
  id: string;
  title: string;
  all_day?: boolean;
  start: string;
  end: string;
  timezone?: string;
  location?: string;
  notes?: string;
  rrule?: string;
  exdates?: string[];
  series?: string;
  original_start?: string;
}

export type CalendarEventSeed = Omit<CalendarEventRecord, 'id'>;

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO `YYYY-MM-DD` `days` from today, so seeds don't rot as the calendar moves. */
export function isoDaysFromToday(days: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The stored instant for a local wall-clock time `days` from today. */
export function instantDaysFromToday(days: number, hour: number, minute = 0): string {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + days,
    hour,
    minute,
  ).toISOString();
}

export async function createCalendar(
  token: string,
  data: { name: string; color?: string },
): Promise<CalendarRecord> {
  return e2eClient(token)
    .collection<CalendarRecord>('calendars')
    .create({ name: data.name, color: data.color ?? 'blue' });
}

function events(token: string, calendarId: string) {
  return collectionAt<CalendarEventRecord>(e2eClient(token), 'calendar-events', [
    'calendars',
    calendarId,
  ]);
}

export async function createCalendarEvent(
  token: string,
  calendarId: string,
  data: CalendarEventSeed,
): Promise<CalendarEventRecord> {
  return events(token, calendarId).create(data);
}

export async function listCalendarEvents(
  token: string,
  calendarId: string,
): Promise<CalendarEventRecord[]> {
  return events(token, calendarId).listAll();
}

export async function listCalendars(token: string): Promise<CalendarRecord[]> {
  return e2eClient(token).collection<CalendarRecord>('calendars').listAll();
}
