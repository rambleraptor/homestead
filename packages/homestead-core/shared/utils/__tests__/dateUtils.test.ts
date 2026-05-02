/**
 * Tests for dateUtils, focusing on holiday detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTodaysHoliday } from '../dateUtils';

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
