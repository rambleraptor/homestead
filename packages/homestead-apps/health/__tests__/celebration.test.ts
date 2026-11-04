import { describe, expect, it } from 'vitest';
import { doseCelebration, parseSeriesPosition } from '../utils/celebration';

const TODAY = '2026-08-31';

describe('parseSeriesPosition', () => {
  it('reads "n of m" and "n/m"', () => {
    expect(parseSeriesPosition('2 of 2')).toEqual({ n: 2, of: 2 });
    expect(parseSeriesPosition('Dose 1 of 3')).toEqual({ n: 1, of: 3 });
    expect(parseSeriesPosition('2/2')).toEqual({ n: 2, of: 2 });
  });

  it('ignores anything else', () => {
    expect(parseSeriesPosition('booster')).toBeNull();
    expect(parseSeriesPosition(undefined)).toBeNull();
    expect(parseSeriesPosition('1 of 0')).toBeNull();
  });
});

describe('doseCelebration', () => {
  it('celebrates the last dose of a series', () => {
    const result = doseCelebration({
      vaccine: { name: 'Shingrix' },
      existingDoses: [{ date_administered: '2026-01-10' }],
      dose: { dose: '2 of 2', date_administered: '2026-03-15' },
      todayIso: TODAY,
    });
    expect(result?.title).toBe('Series complete');
    expect(result?.description).toContain('Shingrix');
  });

  it('stays quiet for a dose mid-series', () => {
    expect(
      doseCelebration({
        vaccine: { name: 'Shingrix' },
        existingDoses: [],
        dose: { dose: '1 of 2', date_administered: '2026-01-10' },
        todayIso: TODAY,
      }),
    ).toBeNull();
  });

  it('celebrates a dose that clears an overdue series', () => {
    const result = doseCelebration({
      vaccine: { name: 'Tdap', next_due: '2026-01-15' },
      existingDoses: [{ date_administered: '2016-01-10' }],
      dose: { dose: 'booster', date_administered: '2026-02-01' },
      todayIso: TODAY,
    });
    expect(result?.title).toBe('Caught up on Tdap');
  });

  it('does not celebrate a dose that leaves the series overdue', () => {
    expect(
      doseCelebration({
        vaccine: { name: 'Tdap', next_due: '2026-01-15' },
        existingDoses: [],
        dose: { dose: 'booster', date_administered: '2025-12-01' },
        todayIso: TODAY,
      }),
    ).toBeNull();
  });

  it('does not celebrate twice: a series already caught up stays quiet', () => {
    expect(
      doseCelebration({
        vaccine: { name: 'Tdap', next_due: '2026-01-15' },
        existingDoses: [{ date_administered: '2026-02-01' }],
        dose: { dose: 'booster', date_administered: '2026-03-01' },
        todayIso: TODAY,
      }),
    ).toBeNull();
  });

  it('is silent for a series that was not overdue', () => {
    expect(
      doseCelebration({
        vaccine: { name: 'Influenza', next_due: '2026-10-01' },
        existingDoses: [],
        dose: { dose: 'yearly', date_administered: '2026-08-30' },
        todayIso: TODAY,
      }),
    ).toBeNull();
  });
});
