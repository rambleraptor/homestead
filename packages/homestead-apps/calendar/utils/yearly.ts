/**
 * The Events app's yearly dates (birthdays, anniversaries) as days on the
 * calendar grid.
 *
 * Those records carry a month and a day but no year, no time and no end, so
 * they aren't calendar events and aren't copied into one — the grid reads them
 * where they live and works out which days in view they land on.
 */

import {
  nthWeekdayOfMonth,
  parseNthWeekdayRule,
} from '@rambleraptor/homestead-core/shared/utils/dateUtils';
import { isoDay, parseDay } from './dates';

/** The fields of an Events-app record this needs. */
export interface YearlySource {
  id: string;
  name: string;
  month?: number;
  day?: number;
  tag?: string;
  recurrence?: string;
  recurrence_rule?: string;
}

export interface YearlyDate {
  /** Unique per record per year. */
  key: string;
  title: string;
  tag?: string;
  /** `YYYY-MM-DD`. */
  day: string;
}

function dayInYear(source: YearlySource, year: number): string | null {
  const { month, day } = source;
  if (!Number.isInteger(month) || month! < 1 || month! > 12) return null;
  if (source.recurrence === 'yearly-nth-weekday') {
    const rule = parseNthWeekdayRule(source.recurrence_rule);
    if (rule) return isoDay(nthWeekdayOfMonth(year, month! - 1, rule.weekday, rule.n));
  }
  if (!Number.isInteger(day) || day! < 1 || day! > 31) return null;
  // A 29 February birthday is kept on the 28th in the years without one.
  const lastDay = new Date(year, month!, 0).getDate();
  return isoDay(new Date(year, month! - 1, Math.min(day!, lastDay)));
}

/** Every yearly date falling on the local days `fromDay`…`toDay`, inclusive, in order. */
export function yearlyDatesBetween(
  sources: readonly YearlySource[],
  fromDay: string,
  toDay: string,
): YearlyDate[] {
  const out: YearlyDate[] = [];
  const lastYear = parseDay(toDay).getFullYear();
  for (let year = parseDay(fromDay).getFullYear(); year <= lastYear; year++) {
    for (const source of sources) {
      const day = dayInYear(source, year);
      if (!day || day < fromDay || day > toDay) continue;
      out.push({ key: `${source.id}:${year}`, title: source.name, tag: source.tag, day });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title));
}
