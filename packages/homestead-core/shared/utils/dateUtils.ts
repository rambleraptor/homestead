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
  name: string;
  message: string;
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
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

// Last Monday in May.
function getMemorialDay(year: number): Date {
  const may31 = new Date(year, 4, 31);
  return new Date(year, 4, 31 - ((may31.getDay() + 6) % 7));
}

export function getTodaysHoliday(): Holiday | null {
  const today = new Date();
  const year = today.getFullYear();
  const key = `${today.getMonth()}-${today.getDate()}`;

  const fixedHolidays: Record<string, Holiday> = {
    '0-1': { name: "New Year's Day", message: 'Happy New Year!' },
    '1-14': { name: "Valentine's Day", message: "Happy Valentine's Day!" },
    '2-17': { name: "St. Patrick's Day", message: "Happy St. Patrick's Day!" },
    '6-4': { name: 'Independence Day', message: 'Happy 4th of July!' },
    '9-31': { name: 'Halloween', message: 'Happy Halloween!' },
    '11-24': { name: 'Christmas Eve', message: 'Merry Christmas Eve!' },
    '11-25': { name: 'Christmas', message: 'Merry Christmas!' },
    '11-31': { name: "New Year's Eve", message: "Happy New Year's Eve!" },
  };
  if (fixedHolidays[key]) return fixedHolidays[key];

  const variable: Array<[Date, Holiday]> = [
    [getEasterDate(year), { name: 'Easter', message: 'Happy Easter!' }],
    [nthWeekdayOfMonth(year, 4, 0, 2), { name: "Mother's Day", message: "Happy Mother's Day!" }],
    [nthWeekdayOfMonth(year, 5, 0, 3), { name: "Father's Day", message: "Happy Father's Day!" }],
    [getMemorialDay(year), { name: 'Memorial Day', message: 'Happy Memorial Day!' }],
    [nthWeekdayOfMonth(year, 8, 1, 1), { name: 'Labor Day', message: 'Happy Labor Day!' }],
    [nthWeekdayOfMonth(year, 10, 4, 4), { name: 'Thanksgiving', message: 'Happy Thanksgiving!' }],
  ];
  for (const [date, holiday] of variable) {
    if (isSameDay(date, today)) return holiday;
  }
  return null;
}
