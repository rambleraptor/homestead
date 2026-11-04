/**
 * How an upcoming event is spoken of — on the list card, in the dashboard
 * widget, and in the one-line summary on the home's chip strip — so all
 * three agree on what "today" is and whose birthday it is.
 */

import { eventAgeLabel } from './eventDate';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatPeopleList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export function isPeopleCenteredTag(tag?: string): boolean {
  return tag === 'birthday' || tag === 'anniversary';
}

/** Local midnight of `now`, so a date compares by calendar day. */
export function startOfDay(now: Date = new Date()): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** Whole calendar days from today until `date` (0 for today, negative past). */
export function daysFromToday(date: Date, now: Date = new Date()): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / MS_PER_DAY);
}

export function isToday(date: Date, now: Date = new Date()): boolean {
  return daysFromToday(date, now) === 0;
}

/** "today", "tomorrow", "in 3 days". */
export function relativeDay(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/**
 * The event as a short possessive phrase: "Sam's birthday", "Sam & Alex's
 * anniversary", or the event's own name when it isn't about its people.
 */
export function eventPhrase(event: { name: string; names: string[]; tag?: string }): string {
  if (isPeopleCenteredTag(event.tag) && event.names.length > 0) {
    return `${possessive(formatPeopleList(event.names))} ${event.tag}`;
  }
  return event.name;
}

function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

/**
 * What the Today badge says beside its "Today": the age or the years, when
 * the event knows its origin year ("Turning 30", "10 years"); else nothing.
 */
export function todayAgeLabel(
  event: { year?: number; tag?: string },
  date: Date,
): string | null {
  return eventAgeLabel(event, date.getFullYear());
}
