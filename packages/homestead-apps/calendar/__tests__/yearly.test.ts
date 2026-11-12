import { describe, expect, it } from 'vitest';
import { yearlyDatesBetween } from '../utils/yearly';

describe('yearlyDatesBetween', () => {
  it('places a fixed yearly date in the days on view', () => {
    const out = yearlyDatesBetween(
      [{ id: 'sam', name: 'Sam’s birthday', month: 11, day: 12, tag: 'birthday' }],
      '2026-11-01',
      '2026-11-30',
    );
    expect(out).toEqual([
      { key: 'sam:2026', title: 'Sam’s birthday', tag: 'birthday', day: '2026-11-12' },
    ]);
  });

  it('leaves out dates that fall outside the range', () => {
    expect(
      yearlyDatesBetween([{ id: 'sam', name: 'Sam', month: 3, day: 3 }], '2026-11-01', '2026-11-30'),
    ).toEqual([]);
  });

  it('finds a date in each year a range crosses', () => {
    const out = yearlyDatesBetween(
      [{ id: 'ny', name: 'New Year', month: 1, day: 1 }],
      '2026-12-28',
      '2028-01-03',
    );
    expect(out.map((d) => d.day)).toEqual(['2027-01-01', '2028-01-01']);
  });

  it('resolves an nth-weekday rule for the year in view', () => {
    // Second Sunday of May: 10 May in 2026, 9 May in 2027.
    const mothersDay = {
      id: 'md',
      name: 'Mother’s Day',
      month: 5,
      day: 1,
      recurrence: 'yearly-nth-weekday',
      recurrence_rule: '2:0',
    };
    expect(yearlyDatesBetween([mothersDay], '2026-05-01', '2026-05-31')[0]?.day).toBe('2026-05-10');
    expect(yearlyDatesBetween([mothersDay], '2027-05-01', '2027-05-31')[0]?.day).toBe('2027-05-09');
  });

  it('keeps a leap-day date on the 28th in other years', () => {
    const leap = { id: 'leap', name: 'Leap baby', month: 2, day: 29 };
    expect(yearlyDatesBetween([leap], '2027-02-01', '2027-02-28')[0]?.day).toBe('2027-02-28');
    expect(yearlyDatesBetween([leap], '2028-02-01', '2028-02-29')[0]?.day).toBe('2028-02-29');
  });

  it('skips a record with no usable date', () => {
    expect(yearlyDatesBetween([{ id: 'x', name: 'Undated' }], '2026-01-01', '2026-12-31')).toEqual([]);
  });
});
