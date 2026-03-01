/**
 * Period Utility Functions
 *
 * Computes period boundaries for credit card perks based on frequency and reset mode.
 */

import type { PerkFrequency, ResetMode, PerkPeriod } from '../types';

/**
 * Get the current period boundaries for a perk.
 *
 * For calendar_year mode:
 *   - monthly: 1st to last day of current month
 *   - quarterly: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
 *   - semi_annual: H1=Jan-Jun, H2=Jul-Dec
 *   - annual: Jan 1 to Dec 31
 *
 * For anniversary mode:
 *   - Periods are relative to the card's anniversary date
 *   - monthly: anniversary day to day before next month's anniversary
 *   - quarterly: every 3 months from anniversary
 *   - semi_annual: every 6 months from anniversary
 *   - annual: anniversary to day before next anniversary
 */
export function getCurrentPeriod(
  frequency: PerkFrequency,
  resetMode: ResetMode,
  anniversaryDate: string,
  referenceDate: Date = new Date()
): PerkPeriod {
  if (resetMode === 'calendar_year') {
    return getCalendarPeriod(frequency, referenceDate);
  }
  return getAnniversaryPeriod(frequency, anniversaryDate, referenceDate);
}

/**
 * Get all periods for a year (used for computing annual value).
 */
export function getPeriodsPerYear(frequency: PerkFrequency): number {
  switch (frequency) {
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'semi_annual':
      return 2;
    case 'annual':
      return 1;
  }
}

/**
 * Get annualized value of a perk.
 */
export function getAnnualizedValue(value: number, frequency: PerkFrequency): number {
  return value * getPeriodsPerYear(frequency);
}

/**
 * Get all periods within a date range (e.g., for a year).
 * Useful for determining which periods have been redeemed.
 */
export function getPeriodsInRange(
  frequency: PerkFrequency,
  resetMode: ResetMode,
  anniversaryDate: string,
  rangeStart: Date,
  rangeEnd: Date
): PerkPeriod[] {
  const periods: PerkPeriod[] = [];
  let current = new Date(rangeStart);

  while (current <= rangeEnd) {
    const period = getCurrentPeriod(frequency, resetMode, anniversaryDate, current);
    // Avoid duplicates
    if (periods.length === 0 || periods[periods.length - 1].start.getTime() !== period.start.getTime()) {
      periods.push(period);
    }
    // Move to next period
    current = new Date(period.end);
    current.setDate(current.getDate() + 1);
  }

  return periods;
}

// --- Internal helpers ---

function getCalendarPeriod(frequency: PerkFrequency, ref: Date): PerkPeriod {
  const year = ref.getFullYear();
  const month = ref.getMonth(); // 0-indexed

  switch (frequency) {
    case 'monthly':
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0), // last day of month
      };

    case 'quarterly': {
      const quarter = Math.floor(month / 3);
      const qStart = quarter * 3;
      return {
        start: new Date(year, qStart, 1),
        end: new Date(year, qStart + 3, 0),
      };
    }

    case 'semi_annual': {
      const half = month < 6 ? 0 : 1;
      return {
        start: new Date(year, half * 6, 1),
        end: new Date(year, half * 6 + 6, 0),
      };
    }

    case 'annual':
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31),
      };
  }
}

function getAnniversaryPeriod(
  frequency: PerkFrequency,
  anniversaryDate: string,
  ref: Date
): PerkPeriod {
  // Parse date string as local time to avoid timezone issues
  // "2024-03-15" → year=2024, month=2 (0-indexed), day=15
  const [, aMonth, aDay] = anniversaryDate.split('T')[0].split('-').map(Number);
  const annivMonth = aMonth - 1; // Convert to 0-indexed
  const annivDay = aDay;

  const monthsPerPeriod = getMonthsPerPeriod(frequency);

  // Find the anniversary cycle start for the reference year.
  // The cycle starts on the anniversary month/day each year.
  // We need to find which period within the current annual cycle the ref date falls in.

  // Determine the current annual cycle start
  let cycleStartYear = ref.getFullYear();
  const cycleStartThisYear = new Date(cycleStartYear, annivMonth, annivDay);

  if (ref < cycleStartThisYear) {
    cycleStartYear--;
  }

  const cycleStart = new Date(cycleStartYear, annivMonth, annivDay);

  // For annual frequency, the period is the entire cycle
  if (frequency === 'annual') {
    const periodEnd = new Date(cycleStartYear + 1, annivMonth, annivDay);
    periodEnd.setDate(periodEnd.getDate() - 1);
    return { start: cycleStart, end: periodEnd };
  }

  // Find which sub-period within the cycle we're in
  for (let i = 0; i < 12 / monthsPerPeriod; i++) {
    const periodStart = new Date(cycleStartYear, annivMonth + i * monthsPerPeriod, annivDay);
    const periodEnd = new Date(cycleStartYear, annivMonth + (i + 1) * monthsPerPeriod, annivDay);
    periodEnd.setDate(periodEnd.getDate() - 1);

    if (ref >= periodStart && ref <= periodEnd) {
      return { start: periodStart, end: periodEnd };
    }
  }

  // Fallback: shouldn't reach here, but return annual period
  const fallbackEnd = new Date(cycleStartYear + 1, annivMonth, annivDay);
  fallbackEnd.setDate(fallbackEnd.getDate() - 1);
  return { start: cycleStart, end: fallbackEnd };
}

function getMonthsPerPeriod(frequency: PerkFrequency): number {
  switch (frequency) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'semi_annual':
      return 6;
    case 'annual':
      return 12;
  }
}

/**
 * Format a period for display (e.g., "Mar 2026" for monthly, "Q1 2026" for quarterly)
 */
export function formatPeriod(period: PerkPeriod, frequency: PerkFrequency): string {
  const start = period.start;

  switch (frequency) {
    case 'monthly':
      return start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    case 'quarterly': {
      const quarter = Math.floor(start.getMonth() / 3) + 1;
      return `Q${quarter} ${start.getFullYear()}`;
    }

    case 'semi_annual': {
      const half = start.getMonth() < 6 ? 1 : 2;
      return `H${half} ${start.getFullYear()}`;
    }

    case 'annual':
      return start.getFullYear().toString();
  }
}

/**
 * Check if a date falls within a period.
 */
export function isDateInPeriod(date: Date, period: PerkPeriod): boolean {
  return date >= period.start && date <= period.end;
}

/**
 * Get the period deadline label (end date formatted).
 */
export function getPeriodDeadline(period: PerkPeriod): string {
  return period.end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
