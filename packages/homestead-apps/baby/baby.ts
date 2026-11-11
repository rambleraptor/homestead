/**
 * The baby log's rules, free of React and the network so they can be tested
 * directly: what "now" looks like for a baby (last feed, last diaper, asleep
 * or awake), how an entry reads, and a day's totals.
 */

import type { BabyEvent, BabyEventFields, Side, VolumeUnit } from './types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const ML_PER_OZ = 29.5735;

/**
 * A breast feed with no end is "still going" only this long. A feed logged
 * with one tap and never stopped then reads as a feed at that time rather than
 * a session that has run all night.
 */
export const NURSING_TIMER_LIMIT_MS = HOUR;

/** How far back the app's main list of events reaches. */
export const WINDOW_DAYS = 14;

/** When an event happened; older rows written without it fall back to when they were saved. */
export function startedAt(event: Pick<BabyEvent, 'started_at' | 'create_time'>): string {
  return event.started_at || event.create_time;
}

const time = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : NaN);

export function byStartedDesc(a: BabyEvent, b: BabyEvent): number {
  return time(startedAt(b)) - time(startedAt(a));
}

/** The sleep the baby is in now, if any: the latest sleep with no end. */
export function currentSleep(events: readonly BabyEvent[]): BabyEvent | undefined {
  const latest = [...events].filter((e) => e.kind === 'sleep').sort(byStartedDesc)[0];
  return latest && !latest.ended_at ? latest : undefined;
}

/** The breast feed being timed now, if any. */
export function currentNursing(events: readonly BabyEvent[], now: number): BabyEvent | undefined {
  const latest = [...events].filter((e) => e.kind === 'feed').sort(byStartedDesc)[0];
  if (!latest || latest.feed_method !== 'breast' || latest.ended_at) return undefined;
  return now - time(startedAt(latest)) < NURSING_TIMER_LIMIT_MS ? latest : undefined;
}

export interface BabyStatus {
  lastFeed?: BabyEvent;
  lastDiaper?: BabyEvent;
  /** The breast feed in progress. */
  nursing?: BabyEvent;
  /** The sleep in progress. */
  sleeping?: BabyEvent;
  /** When the baby last woke: the end of the most recent finished sleep. */
  awakeSince?: string;
}

export function babyStatus(events: readonly BabyEvent[], now: number): BabyStatus {
  const sorted = [...events].sort(byStartedDesc);
  const sleeping = currentSleep(sorted);
  const lastWake = sorted
    .filter((e) => e.kind === 'sleep' && e.ended_at)
    .map((e) => e.ended_at as string)
    .sort((a, b) => time(b) - time(a))[0];
  return {
    lastFeed: sorted.find((e) => e.kind === 'feed'),
    lastDiaper: sorted.find((e) => e.kind === 'diaper'),
    nursing: currentNursing(sorted, now),
    sleeping,
    awakeSince: sleeping ? undefined : lastWake,
  };
}

/** The side to offer first: the one the last breast feed didn't use. */
export function suggestedSide(events: readonly BabyEvent[]): Side | undefined {
  const last = [...events]
    .sort(byStartedDesc)
    .find((e) => e.kind === 'feed' && e.feed_method === 'breast' && (e.side === 'left' || e.side === 'right'));
  if (!last) return undefined;
  return last.side === 'left' ? 'right' : 'left';
}

/** A length of time, compactly: `45s` is `<1m`, then `12m`, `2h 10m`, `3d 4h`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < MINUTE) return '<1m';
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** How long ago something happened: `just now`, else `2h 10m ago`. */
export function formatAgo(iso: string, now: number): string {
  const elapsed = now - time(iso);
  if (!Number.isFinite(elapsed) || elapsed < MINUTE) return 'just now';
  return `${formatDuration(elapsed)} ago`;
}

export function convertVolume(amount: number, from: VolumeUnit, to: VolumeUnit): number {
  if (from === to) return amount;
  return from === 'oz' ? amount * ML_PER_OZ : amount / ML_PER_OZ;
}

/** `4 oz`, `2.5 oz`, `120 ml` — ounces to one decimal, millilitres whole. */
export function formatVolume(amount: number, unit: VolumeUnit): string {
  const rounded = unit === 'oz' ? Math.round(amount * 10) / 10 : Math.round(amount);
  return `${rounded} ${unit}`;
}

const SIDE_LABEL: Record<Side, string> = { left: 'left', right: 'right', both: 'both sides' };
const CONTENTS_LABEL = { breast_milk: 'breast milk', formula: 'formula' } as const;
const DIAPER_LABEL = { wet: 'Wet diaper', dirty: 'Dirty diaper', both: 'Wet and dirty diaper' } as const;

/** What an entry was, without when: `Bottle · 4 oz · formula`, `Wet diaper`. */
export function describeEvent(event: BabyEventFields): string {
  if (event.kind === 'diaper') return event.diaper ? DIAPER_LABEL[event.diaper] : 'Diaper';
  if (event.kind === 'sleep') return 'Sleep';
  if (event.feed_method === 'bottle') {
    const parts = ['Bottle'];
    if (typeof event.amount === 'number') parts.push(formatVolume(event.amount, event.amount_unit ?? 'oz'));
    if (event.contents) parts.push(CONTENTS_LABEL[event.contents]);
    return parts.join(' · ');
  }
  if (event.feed_method === 'breast') {
    return event.side ? `Nursed · ${SIDE_LABEL[event.side]}` : 'Nursed';
  }
  return 'Feed';
}

/** How long a sleep or timed feed ran; to `now` while it's still going. */
export function eventDuration(event: BabyEvent, now: number): number | undefined {
  if (event.kind === 'diaper') return undefined;
  if (event.ended_at) return Math.max(0, time(event.ended_at) - time(startedAt(event)));
  if (event.kind === 'sleep') return Math.max(0, now - time(startedAt(event)));
  return undefined;
}

/** Midnight, local time, at the start of the day `date` falls in. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The events that began on the local day starting at `day`, newest first. */
export function eventsOnDay(events: readonly BabyEvent[], day: Date): BabyEvent[] {
  const from = day.getTime();
  const to = addDays(day, 1).getTime();
  return events
    .filter((e) => {
      const t = time(startedAt(e));
      return t >= from && t < to;
    })
    .sort(byStartedDesc);
}

export interface DayTotals {
  feeds: number;
  /** Bottle volume in the display unit; 0 when no bottle had an amount. */
  bottleVolume: number;
  wet: number;
  dirty: number;
  sleepMs: number;
}

/** A day's totals from the events that began on it. */
export function dayTotals(events: readonly BabyEvent[], unit: VolumeUnit, now: number): DayTotals {
  const totals: DayTotals = { feeds: 0, bottleVolume: 0, wet: 0, dirty: 0, sleepMs: 0 };
  for (const event of events) {
    if (event.kind === 'feed') {
      totals.feeds += 1;
      if (typeof event.amount === 'number') {
        totals.bottleVolume += convertVolume(event.amount, event.amount_unit ?? unit, unit);
      }
    } else if (event.kind === 'diaper') {
      if (event.diaper !== 'dirty') totals.wet += 1;
      if (event.diaper !== 'wet') totals.dirty += 1;
    } else {
      totals.sleepMs += eventDuration(event, now) ?? 0;
    }
  }
  return totals;
}

/** `Today`, `Yesterday`, else `Mon, Nov 9`. */
export function dayLabel(day: Date, now: Date): string {
  const today = startOfDay(now).getTime();
  if (day.getTime() === today) return 'Today';
  if (day.getTime() === addDays(new Date(today), -1).getTime()) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * A baby's age in the unit a parent would say it in: days for the first two
 * weeks, then weeks, then months. `undefined` before the birth date (or
 * without one).
 */
export function babyAge(birthDate: string | undefined, now: Date): string | undefined {
  if (!birthDate) return undefined;
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  const born = new Date(y, m - 1, d);
  const days = Math.round((startOfDay(now).getTime() - born.getTime()) / DAY);
  if (days < 0) return undefined;
  if (days === 0) return 'born today';
  if (days < 14) return `${days} ${days === 1 ? 'day' : 'days'} old`;
  if (days < 84) return `${Math.floor(days / 7)} weeks old`;
  let months = (now.getFullYear() - born.getFullYear()) * 12 + now.getMonth() - born.getMonth();
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 24) return `${months} months old`;
  return `${Math.floor(months / 12)} years old`;
}

/** The value a `datetime-local` input shows for an instant, in local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The instant a `datetime-local` value names, or undefined when it's blank or invalid. */
export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
