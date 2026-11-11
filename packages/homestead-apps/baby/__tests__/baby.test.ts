import { describe, expect, it } from 'vitest';
import {
  babyAge,
  babyStatus,
  convertVolume,
  dayTotals,
  describeEvent,
  eventsOnDay,
  formatAgo,
  formatDuration,
  formatVolume,
  fromLocalInput,
  suggestedSide,
  toLocalInput,
} from '../baby';
import type { BabyEvent, BabyEventFields } from '../types';

const NOW = new Date(2026, 10, 11, 12, 0, 0).getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

let nextId = 0;
function event(fields: BabyEventFields & { started_at: string }): BabyEvent {
  nextId += 1;
  const id = `e${nextId}`;
  return {
    id,
    path: `babies/b/baby-events/${id}`,
    baby: 'b',
    create_time: fields.started_at,
    update_time: fields.started_at,
    ...fields,
  };
}

describe('formatDuration / formatAgo', () => {
  it('scales from minutes to days', () => {
    expect(formatDuration(30_000)).toBe('<1m');
    expect(formatDuration(12 * 60_000)).toBe('12m');
    expect(formatDuration(2 * 3_600_000)).toBe('2h');
    expect(formatDuration(130 * 60_000)).toBe('2h 10m');
    expect(formatDuration(28 * 3_600_000)).toBe('1d 4h');
  });

  it('says "just now" inside the first minute', () => {
    expect(formatAgo(minutesAgo(0.5), NOW)).toBe('just now');
    expect(formatAgo(minutesAgo(130), NOW)).toBe('2h 10m ago');
  });
});

describe('volumes', () => {
  it('keeps ounces to one decimal and millilitres whole', () => {
    expect(formatVolume(4, 'oz')).toBe('4 oz');
    expect(formatVolume(2.54, 'oz')).toBe('2.5 oz');
    expect(formatVolume(118.3, 'ml')).toBe('118 ml');
  });

  it('converts between units only when they differ', () => {
    expect(convertVolume(4, 'oz', 'oz')).toBe(4);
    expect(Math.round(convertVolume(4, 'oz', 'ml'))).toBe(118);
    expect(Math.round(convertVolume(120, 'ml', 'oz') * 10) / 10).toBe(4.1);
  });
});

describe('describeEvent', () => {
  it('reads each kind the way a parent would say it', () => {
    expect(describeEvent({ kind: 'diaper', diaper: 'both' })).toBe('Wet and dirty diaper');
    expect(describeEvent({ kind: 'feed', feed_method: 'breast', side: 'left' })).toBe('Nursed · left');
    expect(
      describeEvent({ kind: 'feed', feed_method: 'bottle', amount: 4, amount_unit: 'oz', contents: 'formula' }),
    ).toBe('Bottle · 4 oz · formula');
    expect(describeEvent({ kind: 'feed', feed_method: 'bottle' })).toBe('Bottle');
    expect(describeEvent({ kind: 'sleep' })).toBe('Sleep');
  });
});

describe('babyStatus', () => {
  it('finds the latest feed and diaper whatever order they arrive in', () => {
    const events = [
      event({ kind: 'feed', feed_method: 'bottle', started_at: minutesAgo(300) }),
      event({ kind: 'diaper', diaper: 'wet', started_at: minutesAgo(45) }),
      event({ kind: 'feed', feed_method: 'bottle', started_at: minutesAgo(130) }),
    ];
    const status = babyStatus(events, NOW);
    expect(status.lastFeed?.started_at).toBe(minutesAgo(130));
    expect(status.lastDiaper?.diaper).toBe('wet');
    expect(status.sleeping).toBeUndefined();
    expect(status.awakeSince).toBeUndefined();
  });

  it('is asleep while the latest sleep has no end, and awake since it ended', () => {
    const asleep = event({ kind: 'sleep', started_at: minutesAgo(35) });
    expect(babyStatus([asleep], NOW).sleeping?.id).toBe(asleep.id);

    const woke = { ...asleep, ended_at: minutesAgo(5) };
    const status = babyStatus([woke], NOW);
    expect(status.sleeping).toBeUndefined();
    expect(status.awakeSince).toBe(minutesAgo(5));
  });

  it('times a breast feed only for the first hour', () => {
    const recent = event({ kind: 'feed', feed_method: 'breast', side: 'left', started_at: minutesAgo(10) });
    expect(babyStatus([recent], NOW).nursing?.id).toBe(recent.id);

    const forgotten = event({ kind: 'feed', feed_method: 'breast', side: 'left', started_at: minutesAgo(90) });
    expect(babyStatus([forgotten], NOW).nursing).toBeUndefined();

    const stopped = { ...recent, ended_at: minutesAgo(2) };
    expect(babyStatus([stopped], NOW).nursing).toBeUndefined();
  });
});

describe('suggestedSide', () => {
  it('offers the side the last breast feed did not use', () => {
    expect(suggestedSide([])).toBeUndefined();
    const events = [
      event({ kind: 'feed', feed_method: 'breast', side: 'right', started_at: minutesAgo(200) }),
      event({ kind: 'feed', feed_method: 'breast', side: 'left', started_at: minutesAgo(60) }),
      event({ kind: 'feed', feed_method: 'bottle', started_at: minutesAgo(10) }),
    ];
    expect(suggestedSide(events)).toBe('right');
  });
});

describe('days', () => {
  const today = new Date(2026, 10, 11);
  const events = [
    event({ kind: 'feed', feed_method: 'bottle', amount: 4, amount_unit: 'oz', started_at: minutesAgo(60) }),
    event({ kind: 'feed', feed_method: 'bottle', amount: 60, amount_unit: 'ml', started_at: minutesAgo(200) }),
    event({ kind: 'feed', feed_method: 'breast', side: 'left', started_at: minutesAgo(400) }),
    event({ kind: 'diaper', diaper: 'wet', started_at: minutesAgo(30) }),
    event({ kind: 'diaper', diaper: 'both', started_at: minutesAgo(90) }),
    event({ kind: 'sleep', started_at: minutesAgo(300), ended_at: minutesAgo(210) }),
    event({ kind: 'sleep', started_at: minutesAgo(20) }),
    // Yesterday evening.
    event({ kind: 'diaper', diaper: 'dirty', started_at: minutesAgo(14 * 60) }),
  ];

  it('keeps only the events that began on the day, newest first', () => {
    const onDay = eventsOnDay(events, today);
    expect(onDay).toHaveLength(7);
    expect(onDay[0]?.kind).toBe('sleep');
  });

  it('totals a day, adding bottles in the display unit and running sleep to now', () => {
    const totals = dayTotals(eventsOnDay(events, today), 'oz', NOW);
    expect(totals.feeds).toBe(3);
    expect(Math.round(totals.bottleVolume * 10) / 10).toBe(6);
    expect(totals.wet).toBe(2);
    expect(totals.dirty).toBe(1);
    expect(totals.sleepMs).toBe(110 * 60_000);
  });
});

describe('babyAge', () => {
  const now = new Date(2026, 11, 20);
  it('counts days, then weeks, then months', () => {
    expect(babyAge(undefined, now)).toBeUndefined();
    expect(babyAge('2026-12-25', now)).toBeUndefined();
    expect(babyAge('2026-12-20', now)).toBe('born today');
    expect(babyAge('2026-12-19', now)).toBe('1 day old');
    expect(babyAge('2026-12-10', now)).toBe('10 days old');
    expect(babyAge('2026-11-15', now)).toBe('5 weeks old');
    expect(babyAge('2026-06-25', now)).toBe('5 months old');
  });
});

describe('datetime-local values', () => {
  it('round-trips an instant to the minute', () => {
    const iso = new Date(2026, 10, 11, 9, 5).toISOString();
    expect(toLocalInput(iso)).toBe('2026-11-11T09:05');
    expect(fromLocalInput(toLocalInput(iso))).toBe(iso);
    expect(fromLocalInput('')).toBeUndefined();
    expect(fromLocalInput('nonsense')).toBeUndefined();
  });
});
