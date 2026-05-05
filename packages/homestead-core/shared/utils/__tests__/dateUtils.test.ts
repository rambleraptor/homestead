/**
 * Tests for dateUtils, focusing on holiday detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getNextEventOccurrence,
  getTodaysHoliday,
  nthWeekdayOfMonth,
  parseDateString,
  parseNthWeekdayRule,
} from '../dateUtils';

/** Create a local-time date to avoid UTC timezone offset issues */
function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0);
}

describe('getTodaysHoliday', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Fixed date holidays', () => {
    it('should return New Year\'s Day on January 1', () => {
      vi.setSystemTime(localDate(2024, 1, 1));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: "New Year's Day",
        message: 'Happy New Year!',
      });
    });

    it('should return Valentine\'s Day on February 14', () => {
      vi.setSystemTime(localDate(2024, 2, 14));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: "Valentine's Day",
        message: "Happy Valentine's Day!",
      });
    });

    it('should return St. Patrick\'s Day on March 17', () => {
      vi.setSystemTime(localDate(2024, 3, 17));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: "St. Patrick's Day",
        message: "Happy St. Patrick's Day!",
      });
    });

    it('should return Independence Day on July 4', () => {
      vi.setSystemTime(localDate(2024, 7, 4));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Independence Day',
        message: 'Happy 4th of July!',
      });
    });

    it('should return Halloween on October 31', () => {
      vi.setSystemTime(localDate(2024, 10, 31));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Halloween',
        message: 'Happy Halloween!',
      });
    });

    it('should return Christmas Eve on December 24', () => {
      vi.setSystemTime(localDate(2024, 12, 24));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Christmas Eve',
        message: 'Merry Christmas Eve!',
      });
    });

    it('should return Christmas on December 25', () => {
      vi.setSystemTime(localDate(2024, 12, 25));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Christmas',
        message: 'Merry Christmas!',
      });
    });

    it('should return New Year\'s Eve on December 31', () => {
      vi.setSystemTime(localDate(2024, 12, 31));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: "New Year's Eve",
        message: "Happy New Year's Eve!",
      });
    });
  });

  describe('Variable date holidays', () => {
    it('should return Easter on correct date (2024)', () => {
      // Easter 2024 is March 31
      vi.setSystemTime(localDate(2024, 3, 31));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Easter',
        message: 'Happy Easter!',
      });
    });

    it('should return Easter on correct date (2025)', () => {
      // Easter 2025 is April 20
      vi.setSystemTime(localDate(2025, 4, 20));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Easter',
        message: 'Happy Easter!',
      });
    });

    it('should return Mother\'s Day on 2nd Sunday in May (2024)', () => {
      // Mother's Day 2024 is May 12
      vi.setSystemTime(localDate(2024, 5, 12));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: "Mother's Day",
        message: "Happy Mother's Day!",
      });
    });

    it('should return Father\'s Day on 3rd Sunday in June (2024)', () => {
      // Father's Day 2024 is June 16
      vi.setSystemTime(localDate(2024, 6, 16));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: "Father's Day",
        message: "Happy Father's Day!",
      });
    });

    it('should return Memorial Day on last Monday in May (2024)', () => {
      // Memorial Day 2024 is May 27
      vi.setSystemTime(localDate(2024, 5, 27));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Memorial Day',
        message: 'Happy Memorial Day!',
      });
    });

    it('should return Labor Day on 1st Monday in September (2024)', () => {
      // Labor Day 2024 is September 2
      vi.setSystemTime(localDate(2024, 9, 2));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Labor Day',
        message: 'Happy Labor Day!',
      });
    });

    it('should return Thanksgiving on 4th Thursday in November (2024)', () => {
      // Thanksgiving 2024 is November 28
      vi.setSystemTime(localDate(2024, 11, 28));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Thanksgiving',
        message: 'Happy Thanksgiving!',
      });
    });
  });

  describe('Non-holiday dates', () => {
    it('should return null on a regular day', () => {
      vi.setSystemTime(localDate(2024, 6, 15));
      const holiday = getTodaysHoliday();
      expect(holiday).toBeNull();
    });

    it('should return null on day before holiday', () => {
      vi.setSystemTime(localDate(2024, 12, 23));
      const holiday = getTodaysHoliday();
      expect(holiday).toBeNull();
    });

    it('should return null on day after holiday', () => {
      vi.setSystemTime(localDate(2024, 12, 26));
      const holiday = getTodaysHoliday();
      expect(holiday).toBeNull();
    });
  });

  describe('Edge cases', () => {
    it('should work correctly in different years for fixed holidays', () => {
      vi.setSystemTime(localDate(2025, 7, 4));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Independence Day',
        message: 'Happy 4th of July!',
      });
    });

    it('should correctly calculate variable holidays in different years', () => {
      // Thanksgiving 2025 is November 27
      vi.setSystemTime(localDate(2025, 11, 27));
      const holiday = getTodaysHoliday();
      expect(holiday).toEqual({
        name: 'Thanksgiving',
        message: 'Happy Thanksgiving!',
      });
    });
  });
});

describe('nthWeekdayOfMonth', () => {
  it('returns the 2nd Sunday of May 2026 (May 10)', () => {
    const d = nthWeekdayOfMonth(2026, 4, 0, 2);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(10);
  });

  it('returns the last Friday of July 2026 (July 31, 5 Fridays)', () => {
    const d = nthWeekdayOfMonth(2026, 6, 5, -1);
    expect(d.getDate()).toBe(31);
  });

  it('returns the last Saturday of July 2024 (July 27, 4 Saturdays)', () => {
    const d = nthWeekdayOfMonth(2024, 6, 6, -1);
    expect(d.getDate()).toBe(27);
  });
});

describe('parseNthWeekdayRule', () => {
  it('parses a valid 2:0 rule', () => {
    expect(parseNthWeekdayRule('2:0')).toEqual({ n: 2, weekday: 0 });
  });

  it('parses -1 (last) for n', () => {
    expect(parseNthWeekdayRule('-1:5')).toEqual({ n: -1, weekday: 5 });
  });

  it('rejects malformed input', () => {
    expect(parseNthWeekdayRule(undefined)).toBeNull();
    expect(parseNthWeekdayRule('')).toBeNull();
    expect(parseNthWeekdayRule('foo')).toBeNull();
    expect(parseNthWeekdayRule('5:0')).toBeNull(); // n=5 not allowed
    expect(parseNthWeekdayRule('1:7')).toBeNull(); // weekday out of range
  });
});

describe('getNextEventOccurrence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('yearly fixed-date (default)', () => {
    it('returns this year if not yet passed', () => {
      vi.setSystemTime(localDate(2026, 5, 5));
      const next = getNextEventOccurrence(parseDateString('2000-08-15'));
      expect(next.getFullYear()).toBe(2026);
      expect(next.getMonth()).toBe(7);
      expect(next.getDate()).toBe(15);
    });

    it('rolls to next year if already passed', () => {
      vi.setSystemTime(localDate(2026, 5, 5));
      const next = getNextEventOccurrence(parseDateString('2000-03-10'));
      expect(next.getFullYear()).toBe(2027);
      expect(next.getMonth()).toBe(2);
      expect(next.getDate()).toBe(10);
    });

    it('treats explicit recurrence=yearly the same as default', () => {
      vi.setSystemTime(localDate(2026, 5, 5));
      const next = getNextEventOccurrence(
        parseDateString('2000-08-15'),
        'yearly',
      );
      expect(next.getMonth()).toBe(7);
      expect(next.getDate()).toBe(15);
    });
  });

  describe('yearly-nth-weekday', () => {
    it('uses month from anchor and ignores day-of-month', () => {
      // 2026-05-05 is a Tuesday — May 5. 2nd Sunday of May 2026 is May 10.
      vi.setSystemTime(localDate(2026, 5, 5));
      const next = getNextEventOccurrence(
        parseDateString('1999-05-01'),
        'yearly-nth-weekday',
        '2:0',
      );
      expect(next.getFullYear()).toBe(2026);
      expect(next.getMonth()).toBe(4);
      expect(next.getDate()).toBe(10);
    });

    it('rolls to next year when this year\'s occurrence has passed', () => {
      // 2026-06-01: 2nd Sunday of May 2026 (May 10) has passed.
      vi.setSystemTime(localDate(2026, 6, 1));
      const next = getNextEventOccurrence(
        parseDateString('1999-05-01'),
        'yearly-nth-weekday',
        '2:0',
      );
      expect(next.getFullYear()).toBe(2027);
      expect(next.getMonth()).toBe(4);
      // 2nd Sunday of May 2027 is May 9.
      expect(next.getDate()).toBe(9);
    });

    it('handles "last" weekday in 4-occurrence and 5-occurrence months', () => {
      // July 2024 has 4 Saturdays (last is the 27th); July 2026 has 5 (the
      // 25th).
      vi.setSystemTime(localDate(2024, 7, 1));
      let next = getNextEventOccurrence(
        parseDateString('2000-07-01'),
        'yearly-nth-weekday',
        '-1:6',
      );
      expect(next.getFullYear()).toBe(2024);
      expect(next.getDate()).toBe(27);

      vi.setSystemTime(localDate(2026, 7, 1));
      next = getNextEventOccurrence(
        parseDateString('2000-07-01'),
        'yearly-nth-weekday',
        '-1:6',
      );
      expect(next.getFullYear()).toBe(2026);
      expect(next.getDate()).toBe(25);
    });

    it('falls back to fixed-date behavior on a malformed rule', () => {
      vi.setSystemTime(localDate(2026, 5, 5));
      const next = getNextEventOccurrence(
        parseDateString('2000-08-15'),
        'yearly-nth-weekday',
        'garbage',
      );
      expect(next.getMonth()).toBe(7);
      expect(next.getDate()).toBe(15);
    });
  });
});
