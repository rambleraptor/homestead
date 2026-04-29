import type { PerkFrequency, ResetMode, PerkPeriod } from '../types';

const MONTHS_PER_PERIOD: Record<PerkFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
};

export function getCurrentPeriod(
  frequency: PerkFrequency,
  resetMode: ResetMode,
  anniversaryDate: string,
  referenceDate: Date = new Date(),
): PerkPeriod {
  return resetMode === 'calendar_year'
    ? getCalendarPeriod(frequency, referenceDate)
    : getAnniversaryPeriod(frequency, anniversaryDate, referenceDate);
}

export function getPeriodsPerYear(frequency: PerkFrequency): number {
  return 12 / MONTHS_PER_PERIOD[frequency];
}

export function getAnnualizedValue(value: number, frequency: PerkFrequency): number {
  return value * getPeriodsPerYear(frequency);
}

export function getPeriodsInRange(
  frequency: PerkFrequency,
  resetMode: ResetMode,
  anniversaryDate: string,
  rangeStart: Date,
  rangeEnd: Date,
): PerkPeriod[] {
  const periods: PerkPeriod[] = [];
  let current = new Date(rangeStart);

  while (current <= rangeEnd) {
    const period = getCurrentPeriod(frequency, resetMode, anniversaryDate, current);
    const last = periods[periods.length - 1];
    if (!last || last.start.getTime() !== period.start.getTime()) {
      periods.push(period);
    }
    current = new Date(period.end);
    current.setDate(current.getDate() + 1);
  }

  return periods;
}

function getCalendarPeriod(frequency: PerkFrequency, ref: Date): PerkPeriod {
  const year = ref.getFullYear();
  const month = ref.getMonth();

  switch (frequency) {
    case 'monthly':
      return { start: new Date(year, month, 1), end: new Date(year, month + 1, 0) };
    case 'quarterly': {
      const qStart = Math.floor(month / 3) * 3;
      return { start: new Date(year, qStart, 1), end: new Date(year, qStart + 3, 0) };
    }
    case 'semi_annual': {
      const hStart = month < 6 ? 0 : 6;
      return { start: new Date(year, hStart, 1), end: new Date(year, hStart + 6, 0) };
    }
    case 'annual':
      return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
  }
}

function getAnniversaryPeriod(
  frequency: PerkFrequency,
  anniversaryDate: string,
  ref: Date,
): PerkPeriod {
  // Parse as local time so "2024-03-15" doesn't shift a day in negative UTC
  // offsets.
  const [, aMonth, aDay] = anniversaryDate.split('T')[0].split('-').map(Number);
  const annivMonth = aMonth - 1;
  const annivDay = aDay;

  // The anniversary cycle starts on annivMonth/annivDay each year; find which
  // year's cycle the reference date falls into.
  const thisYearCycleStart = new Date(ref.getFullYear(), annivMonth, annivDay);
  const cycleStartYear = ref < thisYearCycleStart ? ref.getFullYear() - 1 : ref.getFullYear();

  const monthsPerPeriod = MONTHS_PER_PERIOD[frequency];
  const periodsInCycle = 12 / monthsPerPeriod;

  for (let i = 0; i < periodsInCycle; i++) {
    const start = new Date(cycleStartYear, annivMonth + i * monthsPerPeriod, annivDay);
    const end = new Date(cycleStartYear, annivMonth + (i + 1) * monthsPerPeriod, annivDay);
    end.setDate(end.getDate() - 1);
    if (ref >= start && ref <= end) return { start, end };
  }

  // ref is always within the cycle, so this is unreachable — but TS needs a
  // return.
  const cycleStart = new Date(cycleStartYear, annivMonth, annivDay);
  const cycleEnd = new Date(cycleStartYear + 1, annivMonth, annivDay);
  cycleEnd.setDate(cycleEnd.getDate() - 1);
  return { start: cycleStart, end: cycleEnd };
}

export function formatPeriod(period: PerkPeriod, frequency: PerkFrequency): string {
  const start = period.start;
  switch (frequency) {
    case 'monthly':
      return start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    case 'quarterly':
      return `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`;
    case 'semi_annual':
      return `H${start.getMonth() < 6 ? 1 : 2} ${start.getFullYear()}`;
    case 'annual':
      return start.getFullYear().toString();
  }
}

export function isDateInPeriod(date: Date, period: PerkPeriod): boolean {
  return date >= period.start && date <= period.end;
}

export function getPeriodDeadline(period: PerkPeriod): string {
  return period.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Local-time YYYY-MM-DD. Use this instead of `Date#toISOString().split('T')[0]`,
 * which shifts the date across timezone boundaries (April 1 local can become
 * "2026-03-31" UTC).
 */
export function toLocalISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Canonical YYYY-MM-DD key from either a local-component Date or a stored
 * date string ("YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SSZ"). Use for comparing
 * period boundaries across the wire.
 */
export function dateKey(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return toLocalISODate(value);
}
