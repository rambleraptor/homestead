/**
 * The holiday table: what the seasonal theme, the greeting and the starters
 * key on. Ids must be stable and kebab-case, every day needs an emoji, and the
 * accent shift is reserved for the handful of days with a color of their own.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLIDAYS, getTodaysHoliday, holidayOn } from '../../shared/utils/dateUtils';

const ACCENTED = ['halloween', 'valentines-day', 'st-patricks-day', 'christmas-eve', 'christmas', 'independence-day', 'thanksgiving'];

describe('HOLIDAYS', () => {
  it('has unique kebab-case ids', () => {
    const ids = HOLIDAYS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('gives every day a name, a message and an emoji', () => {
    for (const h of HOLIDAYS) {
      expect(h.name).not.toBe('');
      expect(h.message).not.toBe('');
      expect(h.emoji).not.toBe('');
    }
  });

  it('shifts the accent only on the days with a color of their own, as a hex', () => {
    for (const h of HOLIDAYS) {
      if (ACCENTED.includes(h.id)) expect(h.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
      else expect(h.accent).toBeUndefined();
    }
  });
});

describe('holidayOn', () => {
  it('finds fixed and moving days by id', () => {
    expect(holidayOn(new Date(2026, 9, 31, 12))?.id).toBe('halloween');
    expect(holidayOn(new Date(2026, 10, 26, 12))?.id).toBe('thanksgiving');
    expect(holidayOn(new Date(2026, 11, 24, 12))?.id).toBe('christmas-eve');
    expect(holidayOn(new Date(2026, 3, 5, 12))?.id).toBe('easter');
    expect(holidayOn(new Date(2026, 10, 4, 12))).toBeNull();
  });
});

describe('getTodaysHoliday', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads the clock', () => {
    vi.setSystemTime(new Date(2026, 1, 14, 12));
    expect(getTodaysHoliday()).toMatchObject({ id: 'valentines-day', emoji: '💝', accent: '#D9536F' });
  });
});
