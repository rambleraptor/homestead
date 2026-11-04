import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../../apps/types';
import { initializeAppRegistry, resetAppRegistry } from '../../apps/registry';
import { HOLIDAYS } from '../../shared/utils/dateUtils';
import { HOLIDAY_STARTERS, availableStarters } from '../starters';

const app = (id: string) => ({ id, name: id, resources: [] }) as unknown as AppConfig;
const holiday = (id: string) => HOLIDAYS.find((h) => h.id === id)!;

describe('availableStarters', () => {
  beforeEach(() => initializeAppRegistry([app('todos'), app('groceries')]));
  afterEach(() => resetAppRegistry());

  it('offers the everyday starters for the installed apps, in order', () => {
    expect(availableStarters(null)).toEqual(["What's on my todo list?", 'Add milk to the grocery list']);
  });

  it("leads with the day's starter when its app is installed", () => {
    expect(availableStarters(holiday('thanksgiving'))).toEqual([
      'Plan the Thanksgiving grocery list',
      "What's on my todo list?",
      'Add milk to the grocery list',
    ]);
    expect(availableStarters(holiday('halloween'))[0]).toBe('Add buy candy to my todos');
  });

  it("leaves the day's starter out without its app", () => {
    expect(availableStarters(holiday('christmas'))).toEqual(availableStarters(null));
  });

  it('has nothing seasonal on an ordinary day or a day without a starter', () => {
    expect(availableStarters(holiday('mothers-day'))).toEqual(availableStarters(null));
  });

  it('keeps one starter per holiday, each on a known day', () => {
    const ids = new Set(HOLIDAYS.map((h) => h.id));
    const seen = new Set<string>();
    for (const s of HOLIDAY_STARTERS) {
      expect(ids.has(s.holiday)).toBe(true);
      expect(seen.has(s.holiday)).toBe(false);
      seen.add(s.holiday);
    }
  });
});
