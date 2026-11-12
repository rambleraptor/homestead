/**
 * RFC 5545 recurrence rules: parse one, expand it, and build the handful the
 * form offers.
 *
 * The stored `rrule` is the standard text (`FREQ=WEEKLY;BYDAY=TU,TH`) so a
 * calendar sync can pass rules through untouched. This covers the part of the
 * standard household calendars actually use — DAILY / WEEKLY / MONTHLY /
 * YEARLY with INTERVAL, COUNT, UNTIL, BYDAY (with ordinals), BYMONTHDAY,
 * BYMONTH and WKST. A rule using anything else (BYSETPOS, hourly rules…) is
 * expanded on the parts it does understand rather than dropped.
 *
 * Expansion works on **floating** dates (see `dates.ts`): pure wall-clock
 * arithmetic with no timezone in sight, which keeps this file testable without
 * a clock or a zone.
 */

import { DAY_MS, parseDay } from './dates';

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ByDay {
  /** 0 = Sunday … 6 = Saturday. */
  day: number;
  /** `2` in `2TU` (second Tuesday), `-1` in `-1FR` (last Friday). */
  ordinal?: number;
}

/** A rule's UNTIL: a date (`20270601`) or a UTC instant (`20270601T170000Z`). */
export type Until = { day: string } | { instant: Date };

export interface RecurrenceRule {
  freq: Frequency;
  interval: number;
  count?: number;
  until?: Until;
  byDay: ByDay[];
  byMonthDay: number[];
  /** 1–12. */
  byMonth: number[];
  /** First day of the week, 0 = Sunday. RFC default is Monday. */
  weekStart: number;
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const FREQUENCIES: readonly string[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

function intList(value: string): number[] {
  return value
    .split(',')
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isInteger(n) && n !== 0);
}

/** Parse a rule, with or without the `RRULE:` prefix. Null when it isn't one we can repeat. */
export function parseRRule(text: string | null | undefined): RecurrenceRule | null {
  if (!text) return null;
  const parts = new Map<string, string>();
  for (const piece of text.trim().replace(/^RRULE:/i, '').split(';')) {
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    parts.set(piece.slice(0, eq).trim().toUpperCase(), piece.slice(eq + 1).trim().toUpperCase());
  }
  const freq = parts.get('FREQ');
  if (!freq || !FREQUENCIES.includes(freq)) return null;

  const rule: RecurrenceRule = {
    freq: freq as Frequency,
    interval: 1,
    byDay: [],
    byMonthDay: [],
    byMonth: [],
    weekStart: 1,
  };

  const interval = Number.parseInt(parts.get('INTERVAL') ?? '', 10);
  if (Number.isInteger(interval) && interval > 0) rule.interval = interval;

  const count = Number.parseInt(parts.get('COUNT') ?? '', 10);
  if (Number.isInteger(count) && count > 0) rule.count = count;

  const until = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(parts.get('UNTIL') ?? '');
  if (until) {
    const [, y, m, d, hh, mm, ss] = until;
    rule.until =
      hh === undefined
        ? { day: `${y}-${m}-${d}` }
        : { instant: new Date(Date.UTC(+y!, +m! - 1, +d!, +hh, +mm!, +ss!)) };
  }

  for (const token of (parts.get('BYDAY') ?? '').split(',')) {
    const match = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token.trim());
    if (!match) continue;
    const day = WEEKDAY_CODES.indexOf(match[2] as (typeof WEEKDAY_CODES)[number]);
    const ordinal = match[1] ? Number.parseInt(match[1], 10) : undefined;
    rule.byDay.push(ordinal ? { day, ordinal } : { day });
  }

  rule.byMonthDay = intList(parts.get('BYMONTHDAY') ?? '').filter((n) => Math.abs(n) <= 31);
  rule.byMonth = intList(parts.get('BYMONTH') ?? '').filter((n) => n >= 1 && n <= 12);

  const weekStart = WEEKDAY_CODES.indexOf(
    (parts.get('WKST') ?? '') as (typeof WEEKDAY_CODES)[number],
  );
  if (weekStart >= 0) rule.weekStart = weekStart;

  return rule;
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Days of the month (1-based) matching `byDay`, or BYMONTHDAY, within one month. */
function monthDays(rule: RecurrenceRule, year: number, month: number, fallbackDay: number): number[] {
  const length = daysInMonth(year, month);
  if (rule.byMonthDay.length > 0) {
    return rule.byMonthDay
      .map((d) => (d > 0 ? d : length + d + 1))
      .filter((d) => d >= 1 && d <= length);
  }
  if (rule.byDay.length > 0) {
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const days: number[] = [];
    for (const { day, ordinal } of rule.byDay) {
      const matching: number[] = [];
      for (let d = 1 + ((day - firstWeekday + 7) % 7); d <= length; d += 7) matching.push(d);
      if (ordinal === undefined) days.push(...matching);
      else {
        const pick = ordinal > 0 ? matching[ordinal - 1] : matching[matching.length + ordinal];
        if (pick !== undefined) days.push(pick);
      }
    }
    return days;
  }
  // "Monthly on the 31st" simply skips the months that have no 31st.
  return fallbackDay <= length ? [fallbackDay] : [];
}

/** The start of the `index`th period, at or before every candidate in it. */
function periodStart(dtstart: Date, rule: RecurrenceRule, index: number): number {
  const step = index * rule.interval;
  switch (rule.freq) {
    case 'DAILY':
      return dtstart.getTime() + step * DAY_MS;
    case 'WEEKLY': {
      const midnight = Date.UTC(dtstart.getUTCFullYear(), dtstart.getUTCMonth(), dtstart.getUTCDate());
      const intoWeek = (dtstart.getUTCDay() - rule.weekStart + 7) % 7;
      return midnight + (step * 7 - intoWeek) * DAY_MS;
    }
    case 'MONTHLY':
      return Date.UTC(dtstart.getUTCFullYear(), dtstart.getUTCMonth() + step, 1);
    case 'YEARLY':
      return Date.UTC(dtstart.getUTCFullYear() + step, 0, 1);
  }
}

/** Every start the rule produces in its `index`th period, in order. */
function candidates(dtstart: Date, rule: RecurrenceRule, index: number): number[] {
  const begin = periodStart(dtstart, rule, index);
  const timeOfDay =
    dtstart.getTime() -
    Date.UTC(dtstart.getUTCFullYear(), dtstart.getUTCMonth(), dtstart.getUTCDate());
  const at = (year: number, month: number, day: number) => Date.UTC(year, month, day) + timeOfDay;
  let out: number[];

  switch (rule.freq) {
    case 'DAILY':
      out = [begin];
      break;
    case 'WEEKLY': {
      const days = rule.byDay.length > 0 ? rule.byDay.map((d) => d.day) : [dtstart.getUTCDay()];
      out = days.map((day) => begin + ((day - rule.weekStart + 7) % 7) * DAY_MS + timeOfDay);
      break;
    }
    case 'MONTHLY': {
      const first = new Date(begin);
      const year = first.getUTCFullYear();
      const month = first.getUTCMonth();
      out = monthDays(rule, year, month, dtstart.getUTCDate()).map((d) => at(year, month, d));
      break;
    }
    case 'YEARLY': {
      const year = new Date(begin).getUTCFullYear();
      const months =
        rule.byMonth.length > 0 ? rule.byMonth.map((m) => m - 1) : [dtstart.getUTCMonth()];
      out = months.flatMap((month) =>
        monthDays(rule, year, month, dtstart.getUTCDate()).map((d) => at(year, month, d)),
      );
      break;
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** The period to start from: the one before the one holding `from`, never negative. */
function firstPeriod(dtstart: Date, rule: RecurrenceRule, from: Date): number {
  let elapsed: number;
  switch (rule.freq) {
    case 'DAILY':
      elapsed = (from.getTime() - dtstart.getTime()) / DAY_MS;
      break;
    case 'WEEKLY':
      elapsed = (from.getTime() - periodStart(dtstart, rule, 0)) / (7 * DAY_MS);
      break;
    case 'MONTHLY':
      elapsed =
        (from.getUTCFullYear() - dtstart.getUTCFullYear()) * 12 +
        from.getUTCMonth() -
        dtstart.getUTCMonth();
      break;
    case 'YEARLY':
      elapsed = from.getUTCFullYear() - dtstart.getUTCFullYear();
      break;
  }
  return Math.max(0, Math.floor(elapsed / rule.interval) - 1);
}

/** A backstop against a rule that would otherwise walk forever. */
const MAX_PERIODS = 50_000;

/**
 * The starts a rule produces between `from` and `to` (inclusive), given the
 * series' first start. All three are floating dates. `until` is the rule's
 * UNTIL as a floating date (see `untilFloating`).
 */
export function expandRule(
  dtstart: Date,
  rule: RecurrenceRule,
  from: Date,
  to: Date,
  until?: Date,
): Date[] {
  const limit = until && until.getTime() < to.getTime() ? until.getTime() : to.getTime();
  const out: Date[] = [];
  let produced = 0;
  // COUNT is counted from the very first occurrence, so those rules can't skip
  // ahead; everything else starts near the window.
  const first = rule.count === undefined ? firstPeriod(dtstart, rule, from) : 0;

  for (let index = first; index - first < MAX_PERIODS; index++) {
    if (periodStart(dtstart, rule, index) > limit) break;
    for (const candidate of candidates(dtstart, rule, index)) {
      if (candidate < dtstart.getTime()) continue;
      if (candidate > limit) return out;
      produced++;
      if (rule.count !== undefined && produced > rule.count) return out;
      if (candidate >= from.getTime()) out.push(new Date(candidate));
    }
  }
  return out;
}

/**
 * A rule's UNTIL as a floating date. A date form means "through that day"; an
 * instant form is converted by the caller's `toFloating` (the event's zone).
 */
export function untilFloating(
  rule: RecurrenceRule,
  toFloating: (instant: Date) => Date,
): Date | undefined {
  if (!rule.until) return undefined;
  if ('instant' in rule.until) return toFloating(rule.until.instant);
  const [y, m, d] = rule.until.day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 23, 59, 59, 999));
}

// ---------------------------------------------------------------------------
// The rules the form offers
// ---------------------------------------------------------------------------

export type RepeatPreset =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'yearly'
  /** A rule the form didn't write (from a sync, or the assistant): shown, kept, not editable here. */
  | 'custom';

export const REPEAT_LABELS: Record<Exclude<RepeatPreset, 'custom'>, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Every weekday (Mon–Fri)',
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  monthly: 'Every month',
  yearly: 'Every year',
};

const PRESET_RULES: Record<Exclude<RepeatPreset, 'none' | 'custom'>, string> = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  biweekly: 'FREQ=WEEKLY;INTERVAL=2',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

/** The rule text with any UNTIL removed, normalised for comparison. */
function withoutUntil(rrule: string): string {
  return rrule
    .trim()
    .replace(/^RRULE:/i, '')
    .split(';')
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p !== '' && !p.startsWith('UNTIL='))
    .join(';');
}

/** Which of the form's choices a stored rule is. */
export function presetOf(rrule: string | null | undefined): RepeatPreset {
  if (!rrule) return 'none';
  const bare = withoutUntil(rrule);
  for (const [preset, text] of Object.entries(PRESET_RULES)) {
    if (bare === text) return preset as RepeatPreset;
  }
  return 'custom';
}

/** The last day a rule runs through, `YYYY-MM-DD`, or '' when it has no end date. */
export function untilDayOf(rrule: string | null | undefined): string {
  const until = parseRRule(rrule)?.until;
  if (!until) return '';
  return 'day' in until ? until.day : until.instant.toISOString().slice(0, 10);
}

/** The rule text for one of the form's choices, optionally ending on a day. */
export function buildRRule(preset: RepeatPreset, untilDay?: string): string | undefined {
  if (preset === 'none' || preset === 'custom') return undefined;
  const until = untilDay ? `;UNTIL=${untilDay.replaceAll('-', '')}` : '';
  return `${PRESET_RULES[preset]}${until}`;
}

/** A short human reading of a rule, for the event's detail view. */
export function describeRRule(rrule: string | null | undefined): string {
  const preset = presetOf(rrule);
  if (preset === 'none') return '';
  const base = preset === 'custom' ? 'Repeats on a custom schedule' : REPEAT_LABELS[preset];
  const until = untilDayOf(rrule);
  if (!until) return base;
  const label = parseDay(until).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${base}, until ${label}`;
}
