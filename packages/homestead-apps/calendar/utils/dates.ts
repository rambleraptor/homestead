/**
 * Day and timezone arithmetic for the calendar.
 *
 * Two kinds of value move through this app. A **day** is a `YYYY-MM-DD` string
 * in the viewer's local time — what a grid cell is. A **floating** date is a
 * `Date` whose UTC fields hold a wall-clock reading in some zone ("9:00 on the
 * 12th", wherever that is); recurrence rules are worked out on those, because
 * "every Tuesday at 9" is a statement about a wall clock, not about instants.
 */

export const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a plain `YYYY-MM-DD` date (an all-day event's start or end). */
export function isDay(value: string): boolean {
  return DAY_PATTERN.test(value);
}

/** The local day a moment falls on. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight at the start of a day. */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function todayDay(now: Date = new Date()): string {
  return isoDay(now);
}

export function addDays(day: string, count: number): string {
  const date = parseDay(day);
  return isoDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + count));
}

/** The same day-of-month `count` months on, clamped to the month's last day. */
export function addMonths(day: string, count: number): string {
  const date = parseDay(day);
  const target = new Date(date.getFullYear(), date.getMonth() + count, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return isoDay(new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay)));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!)) / DAY_MS,
  );
}

/** The Sunday on or before `day`. */
export function startOfWeek(day: string): string {
  return addDays(day, -parseDay(day).getDay());
}

/** The seven days of the week containing `day`, Sunday first. */
export function weekDays(day: string): string[] {
  const first = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/**
 * The days a month grid shows for the month containing `day`: whole weeks,
 * Sunday first, from the week holding the 1st to the week holding the last
 * day — so five or six rows, with the neighbouring months' days filling the
 * corners.
 */
export function monthGridDays(day: string): string[] {
  const date = parseDay(day);
  const first = isoDay(new Date(date.getFullYear(), date.getMonth(), 1));
  const last = isoDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(last), 6);
  const count = daysBetween(gridStart, gridEnd) + 1;
  return Array.from({ length: count }, (_, i) => addDays(gridStart, i));
}

export function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

// ---------------------------------------------------------------------------
// Timezones
// ---------------------------------------------------------------------------

/** The viewer's IANA zone, as the browser reports it. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  if (!formatters.has(timeZone)) {
    let formatter: Intl.DateTimeFormat | null = null;
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch {
      // A zone this runtime doesn't know (or junk off the wire): treat as UTC
      // rather than failing to draw the calendar.
    }
    formatters.set(timeZone, formatter);
  }
  return formatters.get(timeZone) ?? null;
}

/** How far the zone's wall clock is ahead of UTC at `instant`, in ms. */
function offsetAt(instant: Date, timeZone: string | undefined): number {
  const formatter = timeZone ? formatterFor(timeZone) : null;
  if (!formatter) return 0;
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const wall = Date.UTC(
    parts.year!,
    parts.month! - 1,
    parts.day!,
    parts.hour!,
    parts.minute!,
    parts.second!,
  );
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The wall-clock reading in `timeZone` at `instant`, as a floating date. */
export function instantToFloating(instant: Date, timeZone: string | undefined): Date {
  return new Date(instant.getTime() + offsetAt(instant, timeZone));
}

/**
 * The instant at which `timeZone`'s wall clock shows `floating`. Two passes,
 * because the offset to subtract is the one in force at the answer, not at the
 * first guess. A reading the clocks skip (spring forward) lands just after the
 * gap; one they repeat (fall back) takes the first pass through.
 */
export function floatingToInstant(floating: Date, timeZone: string | undefined): Date {
  const guess = new Date(floating.getTime() - offsetAt(floating, timeZone));
  return new Date(floating.getTime() - offsetAt(guess, timeZone));
}
