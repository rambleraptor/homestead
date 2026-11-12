import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../types';
import { floatingToInstant, instantToFloating, monthGridDays, weekDays } from '../utils/dates';
import { expandEvents, occurrencesOnDay } from '../utils/occurrences';

/** A local-time instant as the stored UTC text, so the suite passes in any zone. */
const local = (y: number, m: number, d: number, hh = 0, mm = 0) =>
  new Date(y, m - 1, d, hh, mm).toISOString();

function event(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'start' | 'end'>): CalendarEvent {
  return { calendar: 'cal', title: overrides.id, ...overrides };
}

describe('expandEvents', () => {
  it('places a one-off timed event on its local day', () => {
    const out = expandEvents(
      [event({ id: 'dentist', start: local(2026, 11, 12, 9), end: local(2026, 11, 12, 10) })],
      '2026-11-09',
      '2026-11-15',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ startDay: '2026-11-12', endDay: '2026-11-12', recurring: false });
  });

  it('leaves out events outside the window', () => {
    const out = expandEvents(
      [event({ id: 'past', start: local(2026, 11, 1, 9), end: local(2026, 11, 1, 10) })],
      '2026-11-09',
      '2026-11-15',
    );
    expect(out).toEqual([]);
  });

  it('keeps an event that ends at midnight off the following day', () => {
    const [party] = expandEvents(
      [event({ id: 'party', start: local(2026, 11, 12, 20), end: local(2026, 11, 13, 0) })],
      '2026-11-09',
      '2026-11-15',
    );
    expect(party).toMatchObject({ startDay: '2026-11-12', endDay: '2026-11-12' });
  });

  it('spans a multi-day all-day event across each of its days, end inclusive', () => {
    const occurrences = expandEvents(
      [event({ id: 'trip', all_day: true, start: '2026-11-12', end: '2026-11-14' })],
      '2026-11-09',
      '2026-11-15',
    );
    expect(occurrencesOnDay(occurrences, '2026-11-11')).toHaveLength(0);
    expect(occurrencesOnDay(occurrences, '2026-11-12')).toHaveLength(1);
    expect(occurrencesOnDay(occurrences, '2026-11-14')).toHaveLength(1);
    expect(occurrencesOnDay(occurrences, '2026-11-15')).toHaveLength(0);
  });

  it('shows an all-day event that began before the window but runs into it', () => {
    const out = expandEvents(
      [event({ id: 'trip', all_day: true, start: '2026-11-05', end: '2026-11-10' })],
      '2026-11-09',
      '2026-11-15',
    );
    expect(out).toHaveLength(1);
  });

  it('expands an all-day series and skips its exdates', () => {
    const out = expandEvents(
      [
        event({
          id: 'bins',
          all_day: true,
          start: '2026-11-03',
          end: '2026-11-03',
          rrule: 'FREQ=WEEKLY',
          exdates: ['2026-11-17'],
        }),
      ],
      '2026-11-01',
      '2026-11-30',
    );
    expect(out.map((o) => o.startDay)).toEqual(['2026-11-03', '2026-11-10', '2026-11-24']);
    expect(out.every((o) => o.recurring)).toBe(true);
  });

  it('keeps a timed series at the same wall-clock time across a clock change', () => {
    // US clocks fall back on 2026-11-01. 9:00 in New York is 13:00Z before, 14:00Z after.
    const out = expandEvents(
      [
        event({
          id: 'standup',
          start: '2026-10-27T13:00:00.000Z',
          end: '2026-10-27T13:30:00.000Z',
          timezone: 'America/New_York',
          rrule: 'FREQ=WEEKLY',
        }),
      ],
      '2026-10-25',
      '2026-11-12',
    );
    expect(out.map((o) => o.originalStart)).toEqual([
      '2026-10-27T13:00:00.000Z',
      '2026-11-03T14:00:00.000Z',
      '2026-11-10T14:00:00.000Z',
    ]);
  });

  it('skips a timed exdate however the instant was spelled', () => {
    const out = expandEvents(
      [
        event({
          id: 'standup',
          start: '2026-11-10T14:00:00.000Z',
          end: '2026-11-10T14:30:00.000Z',
          timezone: 'UTC',
          rrule: 'FREQ=DAILY;COUNT=3',
          exdates: ['2026-11-11T14:00:00Z'],
        }),
      ],
      '2026-11-08',
      '2026-11-14',
    );
    expect(out.map((o) => o.originalStart)).toEqual([
      '2026-11-10T14:00:00.000Z',
      '2026-11-12T14:00:00.000Z',
    ]);
  });

  it('replaces an occurrence with the record that overrides it', () => {
    const out = expandEvents(
      [
        event({
          id: 'swim',
          title: 'Swimming',
          all_day: true,
          start: '2026-11-03',
          end: '2026-11-03',
          rrule: 'FREQ=WEEKLY',
        }),
        event({
          id: 'swim-moved',
          title: 'Swimming (moved)',
          all_day: true,
          start: '2026-11-11',
          end: '2026-11-11',
          series: 'calendars/cal/calendar-events/swim',
          original_start: '2026-11-10',
        }),
      ],
      '2026-11-01',
      '2026-11-20',
    );
    expect(out.map((o) => [o.event.title, o.startDay])).toEqual([
      ['Swimming', '2026-11-03'],
      ['Swimming (moved)', '2026-11-11'],
      ['Swimming', '2026-11-17'],
    ]);
  });

  it('orders a day all-day first, then by start time', () => {
    const occurrences = expandEvents(
      [
        event({ id: 'late', start: local(2026, 11, 12, 15), end: local(2026, 11, 12, 16) }),
        event({ id: 'early', start: local(2026, 11, 12, 8), end: local(2026, 11, 12, 9) }),
        event({ id: 'holiday', all_day: true, start: '2026-11-12', end: '2026-11-12' }),
      ],
      '2026-11-12',
      '2026-11-12',
    );
    expect(occurrencesOnDay(occurrences, '2026-11-12').map((o) => o.event.id)).toEqual([
      'holiday',
      'early',
      'late',
    ]);
  });

  it('ignores an event whose start cannot be read', () => {
    expect(expandEvents([event({ id: 'junk', start: 'soon', end: 'later' })], '2026-11-01', '2026-11-30')).toEqual([]);
  });
});

describe('timezone conversion', () => {
  it('round-trips an instant through a zone’s wall clock', () => {
    const instant = new Date('2026-07-04T16:30:00.000Z');
    const floating = instantToFloating(instant, 'America/Los_Angeles');
    expect(floating.toISOString()).toBe('2026-07-04T09:30:00.000Z');
    expect(floatingToInstant(floating, 'America/Los_Angeles').toISOString()).toBe(instant.toISOString());
  });

  it('treats an unknown zone as UTC instead of throwing', () => {
    const instant = new Date('2026-07-04T16:30:00.000Z');
    expect(instantToFloating(instant, 'Not/AZone').toISOString()).toBe(instant.toISOString());
  });
});

describe('grid days', () => {
  it('builds a week starting on Sunday', () => {
    expect(weekDays('2026-11-12')).toEqual([
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
  });

  it('builds whole weeks around a month', () => {
    const days = monthGridDays('2026-11-12');
    expect(days[0]).toBe('2026-11-01');
    expect(days.at(-1)).toBe('2026-12-05');
    expect(days.length % 7).toBe(0);
  });
});
