/**
 * Turn stored events into the occurrences a view draws.
 *
 * A one-off event is one occurrence. A series is expanded here, on read, for
 * just the days being looked at — nothing about a repetition is ever stored
 * except the two ways to depart from the rule: `exdates` (skip this one) and a
 * second record pointing back through `series` (this one is different).
 *
 * Pure: events and a day range in, occurrences out. The viewer's zone comes
 * from `Date`'s local fields, the event's zone from its own `timezone`.
 */

import type { CalendarEvent, Occurrence } from '../types';
import {
  DAY_MS,
  addDays,
  daysBetween,
  floatingToInstant,
  instantToFloating,
  isDay,
  isoDay,
  parseDay,
} from './dates';
import { expandRule, parseRRule, untilFloating } from './recurrence';

/** A reference may be stored as a bare id or as a resource name; compare by id. */
export function referenceId(ref: string | undefined): string {
  if (!ref) return '';
  return ref.slice(ref.lastIndexOf('/') + 1);
}

/** An instant in the one spelling we compare by; a date is left alone. */
function normalizeStart(value: string): string {
  if (isDay(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function floatingDay(day: string, endOfDay = false): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!) + (endOfDay ? DAY_MS - 1 : 0));
}

function allDayOccurrences(
  event: CalendarEvent,
  fromDay: string,
  toDay: string,
  skipped: Set<string>,
): Occurrence[] {
  if (!isDay(event.start)) return [];
  const span = isDay(event.end) ? Math.max(0, daysBetween(event.start, event.end)) : 0;
  const rule = parseRRule(event.rrule);

  let startDays: string[];
  if (rule) {
    const dtstart = floatingDay(event.start);
    startDays = expandRule(
      dtstart,
      rule,
      new Date(floatingDay(fromDay).getTime() - span * DAY_MS),
      floatingDay(toDay, true),
      untilFloating(rule, (instant) => instant),
    ).map((d) => d.toISOString().slice(0, 10));
  } else {
    startDays = [event.start];
  }

  const out: Occurrence[] = [];
  for (const startDay of startDays) {
    if (skipped.has(startDay)) continue;
    const endDay = addDays(startDay, span);
    if (endDay < fromDay || startDay > toDay) continue;
    out.push({
      key: `${event.id}:${startDay}`,
      event,
      allDay: true,
      start: parseDay(startDay),
      end: parseDay(addDays(endDay, 1)),
      startDay,
      endDay,
      originalStart: startDay,
      recurring: rule !== null,
    });
  }
  return out;
}

function timedOccurrences(
  event: CalendarEvent,
  fromDay: string,
  toDay: string,
  skipped: Set<string>,
): Occurrence[] {
  const first = new Date(event.start);
  const firstEnd = new Date(event.end);
  if (Number.isNaN(first.getTime())) return [];
  const duration = Number.isNaN(firstEnd.getTime())
    ? 0
    : Math.max(0, firstEnd.getTime() - first.getTime());
  const windowStart = parseDay(fromDay).getTime();
  const windowEnd = parseDay(addDays(toDay, 1)).getTime() - 1;
  const rule = parseRRule(event.rrule);

  let starts: Date[];
  if (rule) {
    const zone = event.timezone;
    // A day of slack either side: the window is in the viewer's zone and the
    // rule runs in the event's, and the exact-overlap check below trims it.
    starts = expandRule(
      instantToFloating(first, zone),
      rule,
      instantToFloating(new Date(windowStart - duration - DAY_MS), zone),
      instantToFloating(new Date(windowEnd + DAY_MS), zone),
      untilFloating(rule, (instant) => instantToFloating(instant, zone)),
    ).map((floating) => floatingToInstant(floating, zone));
  } else {
    starts = [first];
  }

  const out: Occurrence[] = [];
  for (const start of starts) {
    const originalStart = start.toISOString();
    if (skipped.has(originalStart)) continue;
    const end = new Date(start.getTime() + duration);
    if (end.getTime() < windowStart || start.getTime() > windowEnd) continue;
    out.push({
      key: `${event.id}:${originalStart}`,
      event,
      allDay: false,
      start,
      end,
      startDay: isoDay(start),
      // An event that ends at midnight doesn't belong to the day it ends on.
      endDay: isoDay(duration > 0 ? new Date(end.getTime() - 1) : end),
      originalStart,
      recurring: rule !== null,
    });
  }
  return out;
}

/** All-day first, then by start, then by title — the order a day's list reads in. */
export function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return (
    a.start.getTime() - b.start.getTime() ||
    a.event.title.localeCompare(b.event.title) ||
    a.key.localeCompare(b.key)
  );
}

/**
 * Every occurrence touching the local days `fromDay`…`toDay` (inclusive),
 * in order.
 */
export function expandEvents(
  events: readonly CalendarEvent[],
  fromDay: string,
  toDay: string,
): Occurrence[] {
  // The occurrences each series has had replaced by a record of their own.
  const replaced = new Map<string, Set<string>>();
  for (const event of events) {
    if (!event.series || !event.original_start) continue;
    const id = referenceId(event.series);
    if (!replaced.has(id)) replaced.set(id, new Set());
    replaced.get(id)!.add(normalizeStart(event.original_start));
  }

  const out: Occurrence[] = [];
  for (const event of events) {
    const skipped = new Set([
      ...(event.exdates ?? []).map(normalizeStart),
      ...(replaced.get(event.id) ?? []),
    ]);
    out.push(
      ...(event.all_day
        ? allDayOccurrences(event, fromDay, toDay, skipped)
        : timedOccurrences(event, fromDay, toDay, skipped)),
    );
  }
  return out.sort(
    (a, b) => a.startDay.localeCompare(b.startDay) || compareOccurrences(a, b),
  );
}

/** The occurrences that touch one day, in reading order. */
export function occurrencesOnDay(occurrences: readonly Occurrence[], day: string): Occurrence[] {
  return occurrences
    .filter((o) => o.startDay <= day && day <= o.endDay)
    .sort(compareOccurrences);
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formatDayLabel(day: string): string {
  return parseDay(day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** "All day", "9:00 AM – 10:00 AM", or a dated range when it runs past one day. */
export function formatOccurrenceTime(occurrence: Occurrence): string {
  const { allDay, start, end, startDay, endDay } = occurrence;
  if (allDay) {
    return startDay === endDay
      ? 'All day'
      : `${formatDayLabel(startDay)} – ${formatDayLabel(endDay)}`;
  }
  if (startDay === endDay) {
    return end.getTime() === start.getTime()
      ? formatTime(start)
      : `${formatTime(start)} – ${formatTime(end)}`;
  }
  return `${formatDayLabel(startDay)} ${formatTime(start)} – ${formatDayLabel(endDay)} ${formatTime(end)}`;
}

/** "today", "tomorrow", or the weekday — the tail of a sentence, so lowercase for the first two. */
export function relativeDayName(daysAway: number, date: Date): string {
  if (daysAway <= 0) return 'today';
  if (daysAway === 1) return 'tomorrow';
  return `on ${date.toLocaleDateString(undefined, { weekday: 'long' })}`;
}
