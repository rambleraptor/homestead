import { describe, expect, it } from 'vitest';
import {
  buildRRule,
  expandRule,
  parseRRule,
  presetOf,
  untilDayOf,
  untilFloating,
} from '../utils/recurrence';

/** A floating date: UTC fields read as a wall clock. */
const at = (y: number, m: number, d: number, hh = 0, mm = 0) =>
  new Date(Date.UTC(y, m - 1, d, hh, mm));

const days = (dates: Date[]) => dates.map((d) => d.toISOString().slice(0, 10));

function expand(rrule: string, dtstart: Date, from: Date, to: Date) {
  const rule = parseRRule(rrule)!;
  return expandRule(dtstart, rule, from, to, untilFloating(rule, (i) => i));
}

describe('parseRRule', () => {
  it('reads frequency, interval, weekdays and ordinals', () => {
    expect(parseRRule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH')).toMatchObject({
      freq: 'WEEKLY',
      interval: 2,
      byDay: [{ day: 2 }, { day: 4 }],
    });
    expect(parseRRule('FREQ=MONTHLY;BYDAY=2TU,-1FR')?.byDay).toEqual([
      { day: 2, ordinal: 2 },
      { day: 5, ordinal: -1 },
    ]);
  });

  it('reads both forms of UNTIL', () => {
    expect(parseRRule('FREQ=DAILY;UNTIL=20270601')?.until).toEqual({ day: '2027-06-01' });
    expect(parseRRule('FREQ=DAILY;UNTIL=20270601T170000Z')?.until).toEqual({
      instant: new Date('2027-06-01T17:00:00Z'),
    });
  });

  it('rejects text that is not a rule we can repeat', () => {
    expect(parseRRule('')).toBeNull();
    expect(parseRRule('every tuesday')).toBeNull();
    expect(parseRRule('FREQ=HOURLY')).toBeNull();
  });
});

describe('expandRule', () => {
  it('repeats daily, keeping the time of day', () => {
    const out = expand('FREQ=DAILY', at(2026, 11, 10, 9, 30), at(2026, 11, 11), at(2026, 11, 13, 23, 59));
    expect(out.map((d) => d.toISOString())).toEqual([
      '2026-11-11T09:30:00.000Z',
      '2026-11-12T09:30:00.000Z',
      '2026-11-13T09:30:00.000Z',
    ]);
  });

  it('never yields anything before the series starts', () => {
    const out = expand('FREQ=DAILY', at(2026, 11, 10), at(2026, 11, 1), at(2026, 11, 11, 23));
    expect(days(out)).toEqual(['2026-11-10', '2026-11-11']);
  });

  it('repeats weekly on the start weekday when no days are named', () => {
    // 2026-11-10 is a Tuesday.
    const out = expand('FREQ=WEEKLY', at(2026, 11, 10), at(2026, 11, 1), at(2026, 11, 30));
    expect(days(out)).toEqual(['2026-11-10', '2026-11-17', '2026-11-24']);
  });

  it('repeats on several weekdays, skipping the ones before the start', () => {
    // Starts Wednesday the 11th; Monday and Tuesday of that week are before it.
    const out = expand('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', at(2026, 11, 11), at(2026, 11, 9), at(2026, 11, 17, 23));
    expect(days(out)).toEqual([
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-16',
      '2026-11-17',
    ]);
  });

  it('honours an interval of two weeks', () => {
    const out = expand('FREQ=WEEKLY;INTERVAL=2', at(2026, 11, 10), at(2026, 11, 1), at(2026, 12, 31));
    expect(days(out)).toEqual(['2026-11-10', '2026-11-24', '2026-12-08', '2026-12-22']);
  });

  it('skips months that lack the day of a monthly rule', () => {
    const out = expand('FREQ=MONTHLY', at(2026, 1, 31), at(2026, 1, 1), at(2026, 5, 31, 23));
    expect(days(out)).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });

  it('finds the nth and the last weekday of a month', () => {
    const second = expand('FREQ=MONTHLY;BYDAY=2TU', at(2026, 11, 10), at(2026, 11, 1), at(2027, 1, 31));
    expect(days(second)).toEqual(['2026-11-10', '2026-12-08', '2027-01-12']);
    const last = expand('FREQ=MONTHLY;BYDAY=-1FR', at(2026, 11, 27), at(2026, 11, 1), at(2027, 1, 31));
    expect(days(last)).toEqual(['2026-11-27', '2026-12-25', '2027-01-29']);
  });

  it('repeats yearly, and a leap day only in leap years', () => {
    const yearly = expand('FREQ=YEARLY', at(2026, 7, 4), at(2026, 1, 1), at(2028, 12, 31));
    expect(days(yearly)).toEqual(['2026-07-04', '2027-07-04', '2028-07-04']);
    const leap = expand('FREQ=YEARLY', at(2024, 2, 29), at(2024, 1, 1), at(2029, 1, 1));
    expect(days(leap)).toEqual(['2024-02-29', '2028-02-29']);
  });

  it('stops at UNTIL, inclusive of that day', () => {
    const out = expand('FREQ=DAILY;UNTIL=20261112', at(2026, 11, 10, 9), at(2026, 11, 1), at(2026, 11, 30));
    expect(days(out)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
  });

  it('counts COUNT from the first occurrence, not from the window', () => {
    const out = expand('FREQ=DAILY;COUNT=5', at(2026, 11, 10), at(2026, 11, 13), at(2026, 11, 30));
    expect(days(out)).toEqual(['2026-11-13', '2026-11-14']);
  });

  it('expands a window years after the series began', () => {
    const out = expand('FREQ=WEEKLY', at(2016, 11, 8), at(2026, 11, 9), at(2026, 11, 15, 23));
    // 2016-11-08 and 2026-11-10 are both Tuesdays.
    expect(days(out)).toEqual(['2026-11-10']);
  });
});

describe('form presets', () => {
  it('round-trips each preset through its rule text', () => {
    for (const preset of ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'] as const) {
      expect(presetOf(buildRRule(preset))).toBe(preset);
      expect(presetOf(buildRRule(preset, '2027-06-01'))).toBe(preset);
    }
    expect(buildRRule('none')).toBeUndefined();
    expect(presetOf(undefined)).toBe('none');
  });

  it('carries the end date in UNTIL', () => {
    expect(buildRRule('weekly', '2027-06-01')).toBe('FREQ=WEEKLY;UNTIL=20270601');
    expect(untilDayOf('FREQ=WEEKLY;UNTIL=20270601')).toBe('2027-06-01');
    expect(untilDayOf('FREQ=WEEKLY')).toBe('');
  });

  it('calls a rule the form did not write custom', () => {
    expect(presetOf('FREQ=MONTHLY;BYDAY=2TU')).toBe('custom');
    expect(presetOf('FREQ=DAILY;COUNT=3')).toBe('custom');
  });
});
