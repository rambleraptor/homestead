// Parse a "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS..." string into a local-time
// Date. Using `new Date(s)` would interpret a date-only string as UTC, which
// can shift the day for users in negative offsets.
export function parseDateString(dateString: string): Date {
  const [year, month, day] = dateString.substring(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', options ?? {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
}

export function formatRelativeTime(dateString: string): string {
  const diffInMs = Date.now() - new Date(dateString).getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
  return `${Math.floor(diffInDays / 365)} years ago`;
}

export function isToday(dateString: string): boolean {
  return isSameDay(new Date(dateString), new Date());
}

export function isSameDay(date1: string | Date, date2: string | Date): boolean {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

// Returns this year's (or next year's, if already past) occurrence of an
// annually-recurring date like a birthday.
export function getNextOccurrence(date: Date): Date {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const thisYear = new Date(startOfToday.getFullYear(), date.getMonth(), date.getDate());
  if (thisYear >= startOfToday) return thisYear;
  return new Date(startOfToday.getFullYear() + 1, date.getMonth(), date.getDate());
}

export function isUpcoming(date: Date, days: number = 30): boolean {
  const next = getNextOccurrence(date);
  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setDate(now.getDate() + days);
  return next >= now && next <= futureDate;
}

export function getDaysUntil(date: Date): number {
  const diffMs = getNextOccurrence(date).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function sortByUpcoming<T>(
  items: T[],
  dateGetter: (item: T) => Date | null
): T[] {
  return [...items].sort((a, b) => {
    const dateA = dateGetter(a);
    const dateB = dateGetter(b);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return getNextOccurrence(dateA).getTime() - getNextOccurrence(dateB).getTime();
  });
}

export function getUpcomingEvents(
  birthday: string | null,
  anniversary: string | null,
  days: number = 30
): Array<{ type: 'Birthday' | 'Anniversary'; date: Date }> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const futureDate = new Date(startOfToday);
  futureDate.setDate(startOfToday.getDate() + days);

  const events: Array<{ type: 'Birthday' | 'Anniversary'; date: Date }> = [];
  const add = (type: 'Birthday' | 'Anniversary', raw: string | null) => {
    if (!raw?.trim()) return;
    const next = getNextOccurrence(parseDateString(raw));
    if (next >= startOfToday && next <= futureDate) events.push({ type, date: next });
  };
  add('Birthday', birthday);
  add('Anniversary', anniversary);

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface Holiday {
  /** A stable kebab-case id (`halloween`): what the seasonal theme keys on. */
  id: string;
  name: string;
  message: string;
  /** The day's emoji: the greeting's prefix and the favicon for the day. */
  emoji: string;
  /**
   * A hex color the day shifts the app's accent to, for the handful of
   * holidays with a color of their own. Left off for the rest.
   */
  accent?: string;
}

// Anonymous Gregorian algorithm.
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

// Nth occurrence of a weekday (0=Sun..6=Sat) in a given month (0-indexed).
// `n` is 1..4 for the first through fourth occurrence, or -1 for the last.
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): Date {
  if (n === -1) {
    const lastDay = new Date(year, month + 1, 0);
    const offset = (lastDay.getDay() - weekday + 7) % 7;
    return new Date(year, month, lastDay.getDate() - offset);
  }
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

export type EventRecurrence = 'yearly' | 'yearly-nth-weekday';

// Parse an "<n>:<weekday>" rule string. Returns null if malformed.
export function parseNthWeekdayRule(
  rule: string | undefined,
): { n: number; weekday: number } | null {
  if (!rule) return null;
  const [nRaw, weekdayRaw] = rule.split(':');
  const n = Number(nRaw);
  const weekday = Number(weekdayRaw);
  if (!Number.isInteger(n) || !Number.isInteger(weekday)) return null;
  if (weekday < 0 || weekday > 6) return null;
  if (n !== -1 && (n < 1 || n > 4)) return null;
  return { n, weekday };
}

// Resolve the next occurrence of an event given its anchor date and optional
// recurrence rule. For yearly fixed-date events (the default), this returns
// this year's month/day, or next year's if already past. For
// `yearly-nth-weekday`, the anchor's month is used and the day-of-month is
// ignored — the rule encodes which weekday and which occurrence.
export function getNextEventOccurrence(
  anchor: Date,
  recurrence?: EventRecurrence,
  rule?: string,
): Date {
  if (recurrence !== 'yearly-nth-weekday') {
    return getNextOccurrence(anchor);
  }
  const parsed = parseNthWeekdayRule(rule);
  if (!parsed) return getNextOccurrence(anchor);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const month = anchor.getMonth();

  const thisYear = nthWeekdayOfMonth(
    startOfToday.getFullYear(),
    month,
    parsed.weekday,
    parsed.n,
  );
  if (thisYear >= startOfToday) return thisYear;
  return nthWeekdayOfMonth(
    startOfToday.getFullYear() + 1,
    month,
    parsed.weekday,
    parsed.n,
  );
}

// Last Monday in May.
function getMemorialDay(year: number): Date {
  const may31 = new Date(year, 4, 31);
  return new Date(year, 4, 31 - ((may31.getDay() + 6) % 7));
}

/**
 * Every holiday the app marks, keyed by a fixed month/day (`'9-31'`, month
 * 0-indexed) or by a rule for the ones that move. Ids are unique and kebab-case.
 */
export const HOLIDAYS: readonly Holiday[] = [
  { id: 'new-years-day', name: "New Year's Day", message: 'Happy New Year!', emoji: '🎉' },
  { id: 'valentines-day', name: "Valentine's Day", message: "Happy Valentine's Day!", emoji: '💝', accent: '#D9536F' },
  { id: 'st-patricks-day', name: "St. Patrick's Day", message: "Happy St. Patrick's Day!", emoji: '☘️', accent: '#2E9E5B' },
  { id: 'easter', name: 'Easter', message: 'Happy Easter!', emoji: '🐣' },
  { id: 'mothers-day', name: "Mother's Day", message: "Happy Mother's Day!", emoji: '💐' },
  { id: 'memorial-day', name: 'Memorial Day', message: 'Happy Memorial Day!', emoji: '🇺🇸' },
  { id: 'fathers-day', name: "Father's Day", message: "Happy Father's Day!", emoji: '👔' },
  { id: 'independence-day', name: 'Independence Day', message: 'Happy 4th of July!', emoji: '🎆', accent: '#3B6FD1' },
  { id: 'labor-day', name: 'Labor Day', message: 'Happy Labor Day!', emoji: '🛠️' },
  { id: 'halloween', name: 'Halloween', message: 'Happy Halloween!', emoji: '🎃', accent: '#E0702B' },
  { id: 'thanksgiving', name: 'Thanksgiving', message: 'Happy Thanksgiving!', emoji: '🦃', accent: '#D28A1F' },
  { id: 'christmas-eve', name: 'Christmas Eve', message: 'Merry Christmas Eve!', emoji: '🎄', accent: '#C8403A' },
  { id: 'christmas', name: 'Christmas', message: 'Merry Christmas!', emoji: '🎄', accent: '#C8403A' },
  { id: 'new-years-eve', name: "New Year's Eve", message: "Happy New Year's Eve!", emoji: '🥂' },
];

const holidayById = (id: string): Holiday => {
  const holiday = HOLIDAYS.find((h) => h.id === id);
  if (!holiday) throw new Error(`unknown holiday ${id}`);
  return holiday;
};

/** `'<month>-<day>'` (month 0-indexed) → holiday, for the ones on a fixed date. */
const FIXED_HOLIDAYS: Record<string, string> = {
  '0-1': 'new-years-day',
  '1-14': 'valentines-day',
  '2-17': 'st-patricks-day',
  '6-4': 'independence-day',
  '9-31': 'halloween',
  '11-24': 'christmas-eve',
  '11-25': 'christmas',
  '11-31': 'new-years-eve',
};

/** The holiday on `today`, if any. */
export function holidayOn(today: Date): Holiday | null {
  const year = today.getFullYear();
  const key = `${today.getMonth()}-${today.getDate()}`;
  const fixed = FIXED_HOLIDAYS[key];
  if (fixed) return holidayById(fixed);

  const variable: Array<[Date, string]> = [
    [getEasterDate(year), 'easter'],
    [nthWeekdayOfMonth(year, 4, 0, 2), 'mothers-day'],
    [nthWeekdayOfMonth(year, 5, 0, 3), 'fathers-day'],
    [getMemorialDay(year), 'memorial-day'],
    [nthWeekdayOfMonth(year, 8, 1, 1), 'labor-day'],
    [nthWeekdayOfMonth(year, 10, 4, 4), 'thanksgiving'],
  ];
  for (const [date, id] of variable) {
    if (isSameDay(date, today)) return holidayById(id);
  }
  return null;
}

export function getTodaysHoliday(): Holiday | null {
  return holidayOn(new Date());
}
