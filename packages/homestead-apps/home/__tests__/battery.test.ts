import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOW_THRESHOLD,
  isLow,
  isRecharged,
  reportedAgo,
  thresholdOf,
} from '../utils/battery';

describe('battery rules', () => {
  it('defaults the threshold when unset or nonsense', () => {
    expect(thresholdOf({})).toBe(DEFAULT_LOW_THRESHOLD);
    expect(thresholdOf({ low_threshold: 0 })).toBe(DEFAULT_LOW_THRESHOLD);
    expect(thresholdOf({ low_threshold: 35 })).toBe(35);
  });

  it('is low at or below the threshold, unless charging', () => {
    expect(isLow({ battery_percent: 20 })).toBe(true);
    expect(isLow({ battery_percent: 21 })).toBe(false);
    expect(isLow({ battery_percent: 5, charging: true })).toBe(false);
    expect(isLow({ battery_percent: null })).toBe(false);
  });

  it('is recharged on the charger or at 80%, and above a high threshold', () => {
    expect(isRecharged({ battery_percent: 79 })).toBe(false);
    expect(isRecharged({ battery_percent: 80 })).toBe(true);
    expect(isRecharged({ battery_percent: 3, charging: true })).toBe(true);
    expect(isRecharged({ battery_percent: 85, low_threshold: 90 })).toBe(false);
    expect(isRecharged({ battery_percent: null })).toBe(false);
  });

  it('describes the last report coarsely', () => {
    const now = new Date('2026-09-24T12:00:00Z');
    expect(reportedAgo(undefined, now)).toBe('never reported');
    expect(reportedAgo('2026-09-24T11:59:40Z', now)).toBe('just now');
    expect(reportedAgo('2026-09-24T11:48:00Z', now)).toBe('12 min ago');
    expect(reportedAgo('2026-09-24T09:00:00Z', now)).toBe('3 h ago');
    expect(reportedAgo('2026-09-23T12:00:00Z', now)).toBe('1 day ago');
  });
});
