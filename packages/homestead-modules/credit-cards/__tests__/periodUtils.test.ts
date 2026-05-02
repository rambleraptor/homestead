import { describe, it, expect } from 'vitest';
import {
  getCurrentPeriod,
  getPeriodsPerYear,
  getAnnualizedValue,
  formatPeriod,
  isDateInPeriod,
  getPeriodsInRange,
} from '../utils/periodUtils';

describe('periodUtils', () => {
  describe('getPeriodsPerYear', () => {
    it('returns 12 for monthly', () => {
      expect(getPeriodsPerYear('monthly')).toBe(12);
    });

    it('returns 4 for quarterly', () => {
      expect(getPeriodsPerYear('quarterly')).toBe(4);
    });

    it('returns 2 for semi_annual', () => {
      expect(getPeriodsPerYear('semi_annual')).toBe(2);
    });

    it('returns 1 for annual', () => {
      expect(getPeriodsPerYear('annual')).toBe(1);
    });
  });

  describe('getAnnualizedValue', () => {
    it('annualizes monthly value', () => {
      expect(getAnnualizedValue(10, 'monthly')).toBe(120);
    });

    it('annualizes quarterly value', () => {
      expect(getAnnualizedValue(50, 'quarterly')).toBe(200);
    });

    it('annualizes semi_annual value', () => {
      expect(getAnnualizedValue(100, 'semi_annual')).toBe(200);
    });

    it('returns same value for annual', () => {
      expect(getAnnualizedValue(300, 'annual')).toBe(300);
    });
  });

  describe('getCurrentPeriod - calendar_year', () => {
    it('returns correct monthly period', () => {
      const ref = new Date(2026, 2, 15); // March 15, 2026
      const period = getCurrentPeriod('monthly', 'calendar_year', '', ref);

      expect(period.start).toEqual(new Date(2026, 2, 1));
      expect(period.end).toEqual(new Date(2026, 2, 31));
    });

    it('returns correct monthly period for February', () => {
      const ref = new Date(2026, 1, 10); // Feb 10, 2026
      const period = getCurrentPeriod('monthly', 'calendar_year', '', ref);

      expect(period.start).toEqual(new Date(2026, 1, 1));
      expect(period.end).toEqual(new Date(2026, 1, 28));
    });

    it('returns correct quarterly period for Q1', () => {
      const ref = new Date(2026, 1, 15); // Feb 15 = Q1
      const period = getCurrentPeriod('quarterly', 'calendar_year', '', ref);

      expect(period.start).toEqual(new Date(2026, 0, 1));
      expect(period.end).toEqual(new Date(2026, 2, 31));
    });

    it('returns correct quarterly period for Q3', () => {
      const ref = new Date(2026, 8, 1); // Sep 1 = Q3
      const period = getCurrentPeriod('quarterly', 'calendar_year', '', ref);

      expect(period.start).toEqual(new Date(2026, 6, 1));
      expect(period.end).toEqual(new Date(2026, 8, 30));
    });

    it('returns correct semi_annual period for H1', () => {
      const ref = new Date(2026, 3, 1); // April = H1
      const period = getCurrentPeriod('semi_annual', 'calendar_year', '', ref);

      expect(period.start).toEqual(new Date(2026, 0, 1));
      expect(period.end).toEqual(new Date(2026, 5, 30));
    });

    it('returns correct semi_annual period for H2', () => {
      const ref = new Date(2026, 9, 1); // October = H2
      const period = getCurrentPeriod('semi_annual', 'calendar_year', '', ref);

      expect(period.start).toEqual(new Date(2026, 6, 1));
      expect(period.end).toEqual(new Date(2026, 11, 31));
    });

    it('returns correct annual period', () => {
      const ref = new Date(2026, 5, 15);
      const period = getCurrentPeriod('annual', 'calendar_year', '', ref);

      expect(period.start).toEqual(new Date(2026, 0, 1));
      expect(period.end).toEqual(new Date(2026, 11, 31));
    });
  });

  describe('getCurrentPeriod - anniversary', () => {
    it('returns correct annual anniversary period', () => {
      // Anniversary: March 15. Ref: July 10, 2026
      const ref = new Date(2026, 6, 10);
      const period = getCurrentPeriod('annual', 'anniversary', '2024-03-15', ref);

      expect(period.start).toEqual(new Date(2026, 2, 15));
      // End is day before next anniversary
      expect(period.end).toEqual(new Date(2027, 2, 14));
    });

    it('returns correct annual period when before anniversary in current year', () => {
      // Anniversary: March 15. Ref: Feb 10, 2026 → still in 2025 cycle
      const ref = new Date(2026, 1, 10);
      const period = getCurrentPeriod('annual', 'anniversary', '2024-03-15', ref);

      expect(period.start).toEqual(new Date(2025, 2, 15));
      expect(period.end).toEqual(new Date(2026, 2, 14));
    });

    it('returns correct monthly anniversary period', () => {
      // Anniversary: Jan 10. Ref: March 20, 2026
      const ref = new Date(2026, 2, 20);
      const period = getCurrentPeriod('monthly', 'anniversary', '2024-01-10', ref);

      expect(period.start).toEqual(new Date(2026, 2, 10));
      // End is day before next period start (Apr 10 - 1 = Apr 9)
      expect(period.end).toEqual(new Date(2026, 3, 9));
    });

    it('returns correct quarterly anniversary period', () => {
      // Anniversary: Feb 1. Ref: June 15, 2026
      // Cycle: Feb 1, 2026. Quarters: Feb-Apr, May-Jul, Aug-Oct, Nov-Jan
      // June 15 falls in May-Jul quarter
      const ref = new Date(2026, 5, 15);
      const period = getCurrentPeriod('quarterly', 'anniversary', '2024-02-01', ref);

      expect(period.start).toEqual(new Date(2026, 4, 1)); // May 1
      expect(period.end).toEqual(new Date(2026, 6, 31)); // Jul 31
    });
  });

  describe('formatPeriod', () => {
    it('formats monthly period', () => {
      const period = { start: new Date(2026, 2, 1), end: new Date(2026, 2, 31) };
      expect(formatPeriod(period, 'monthly')).toBe('Mar 2026');
    });

    it('formats quarterly period for Q1', () => {
      const period = { start: new Date(2026, 0, 1), end: new Date(2026, 2, 31) };
      expect(formatPeriod(period, 'quarterly')).toBe('Q1 2026');
    });

    it('formats semi_annual period for H2', () => {
      const period = { start: new Date(2026, 6, 1), end: new Date(2026, 11, 31) };
      expect(formatPeriod(period, 'semi_annual')).toBe('H2 2026');
    });

    it('formats annual period', () => {
      const period = { start: new Date(2026, 0, 1), end: new Date(2026, 11, 31) };
      expect(formatPeriod(period, 'annual')).toBe('2026');
    });
  });

  describe('isDateInPeriod', () => {
    const period = { start: new Date(2026, 2, 1), end: new Date(2026, 2, 31) };

    it('returns true for date within period', () => {
      expect(isDateInPeriod(new Date(2026, 2, 15), period)).toBe(true);
    });

    it('returns true for start date', () => {
      expect(isDateInPeriod(new Date(2026, 2, 1), period)).toBe(true);
    });

    it('returns true for end date', () => {
      expect(isDateInPeriod(new Date(2026, 2, 31), period)).toBe(true);
    });

    it('returns false for date before period', () => {
      expect(isDateInPeriod(new Date(2026, 1, 28), period)).toBe(false);
    });

    it('returns false for date after period', () => {
      expect(isDateInPeriod(new Date(2026, 3, 1), period)).toBe(false);
    });
  });

  describe('getPeriodsInRange', () => {
    it('returns 12 monthly periods for a full year', () => {
      const periods = getPeriodsInRange(
        'monthly',
        'calendar_year',
        '',
        new Date(2026, 0, 1),
        new Date(2026, 11, 31)
      );
      expect(periods).toHaveLength(12);
      expect(periods[0].start).toEqual(new Date(2026, 0, 1));
      expect(periods[11].end).toEqual(new Date(2026, 11, 31));
    });

    it('returns 4 quarterly periods for a full year', () => {
      const periods = getPeriodsInRange(
        'quarterly',
        'calendar_year',
        '',
        new Date(2026, 0, 1),
        new Date(2026, 11, 31)
      );
      expect(periods).toHaveLength(4);
    });

    it('returns 1 annual period for a full year', () => {
      const periods = getPeriodsInRange(
        'annual',
        'calendar_year',
        '',
        new Date(2026, 0, 1),
        new Date(2026, 11, 31)
      );
      expect(periods).toHaveLength(1);
    });
  });
});
