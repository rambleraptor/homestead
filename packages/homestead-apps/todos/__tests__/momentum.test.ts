/**
 * The momentum arithmetic, pinned at its edges: the week window, the day
 * boundary in local time, a streak that ends today or yesterday, and the gap
 * that breaks it.
 */

import { describe, expect, it } from 'vitest';
import {
  computeMomentum,
  localDayKey,
  milestoneKey,
  momentumHeadline,
  STREAK_MILESTONES,
} from '../momentum';

/** A local-time moment on a calendar day, `daysAgo` days before `now`. */
function daysAgo(now: Date, days: number, hour = 12): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour, 0, 0);
}

// A fixed local "now": a Wednesday at 15:30.
const now = new Date(2026, 10, 4, 15, 30, 0);

describe('computeMomentum', () => {
  it('counts nothing from nothing', () => {
    expect(computeMomentum([], now)).toEqual({ doneThisWeek: 0, streak: 0 });
  });

  it('counts completions inside the last seven days, and not older ones', () => {
    const times = [daysAgo(now, 0), daysAgo(now, 3), daysAgo(now, 6, 23), daysAgo(now, 7, 12)];
    // 7 days ago at noon is more than 7×24h before 15:30 today.
    expect(computeMomentum(times, now).doneThisWeek).toBe(3);
  });

  it('accepts RFC 3339 strings and ignores what it cannot parse', () => {
    expect(
      computeMomentum([daysAgo(now, 1).toISOString(), 'not a date', ''], now).doneThisWeek,
    ).toBe(1);
  });

  it('ignores a completion stamped in the future', () => {
    expect(computeMomentum([daysAgo(now, -1)], now)).toEqual({ doneThisWeek: 0, streak: 0 });
  });

  it('runs the streak back from today over consecutive days', () => {
    const times = [daysAgo(now, 0), daysAgo(now, 1), daysAgo(now, 2)];
    expect(computeMomentum(times, now).streak).toBe(3);
  });

  it('lets the streak end on yesterday, so the morning does not break it', () => {
    const times = [daysAgo(now, 1), daysAgo(now, 2)];
    expect(computeMomentum(times, now).streak).toBe(2);
  });

  it('is zero when the last completion was the day before yesterday', () => {
    expect(computeMomentum([daysAgo(now, 2), daysAgo(now, 3)], now).streak).toBe(0);
  });

  it('stops at a gap', () => {
    const times = [daysAgo(now, 0), daysAgo(now, 1), daysAgo(now, 3), daysAgo(now, 4)];
    expect(computeMomentum(times, now).streak).toBe(2);
  });

  it('counts a day once however many were finished on it', () => {
    const times = [daysAgo(now, 0, 8), daysAgo(now, 0, 9), daysAgo(now, 0, 14)];
    expect(computeMomentum(times, now)).toEqual({ doneThisWeek: 3, streak: 1 });
  });

  it('draws the day boundary at local midnight', () => {
    // 00:10 today is today; 23:50 yesterday is yesterday — adjacent, so both
    // make one streak of two, whatever UTC thinks of them.
    const times = [daysAgo(now, 0, 0).getTime() + 10 * 60_000, daysAgo(now, 1, 23).getTime() + 50 * 60_000];
    expect(computeMomentum(times.map((t) => new Date(t)), now).streak).toBe(2);
  });

  it('keeps counting a streak longer than the week window', () => {
    const times = Array.from({ length: 12 }, (_, i) => daysAgo(now, i));
    expect(computeMomentum(times, now)).toEqual({ doneThisWeek: 7, streak: 12 });
  });
});

describe('localDayKey', () => {
  it('formats the local calendar date, zero-padded', () => {
    expect(localDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('momentumHeadline', () => {
  it('says nothing when nothing was finished this week', () => {
    expect(momentumHeadline({ doneThisWeek: 0, streak: 0 })).toBeNull();
  });

  it('leads with the streak when there is one', () => {
    expect(momentumHeadline({ doneThisWeek: 5, streak: 3 })).toBe('3-day streak · 5 done this week');
  });

  it('leaves the streak out when it is broken', () => {
    expect(momentumHeadline({ doneThisWeek: 2, streak: 0 })).toBe('2 done this week');
  });
});

describe('milestones', () => {
  it('are a week and a month', () => {
    expect(STREAK_MILESTONES).toEqual([7, 30]);
  });

  it('are remembered per person, milestone and day', () => {
    expect(milestoneKey('u1', 7, '2026-11-04')).toBe('todos:momentum:u1:7:2026-11-04');
    expect(milestoneKey('u1', 7, '2026-11-04')).not.toBe(milestoneKey('u2', 7, '2026-11-04'));
    expect(milestoneKey('u1', 7, '2026-11-04')).not.toBe(milestoneKey('u1', 30, '2026-11-04'));
    expect(milestoneKey('u1', 7, '2026-11-04')).not.toBe(milestoneKey('u1', 7, '2026-11-05'));
  });
});
