import { describe, expect, it } from 'vitest';
import { summarizeCalendar } from '../hooks/useCalendarSummary';
import { upcomingFrom } from '../hooks/useUpcomingOccurrences';
import type { CalendarEvent } from '../types';
import { expandEvents } from '../utils/occurrences';

/** Wednesday 11 Nov 2026, 2pm local. */
const NOW = new Date(2026, 10, 11, 14, 0);

const local = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();

function upcoming(events: Array<Partial<CalendarEvent> & { id: string; start: string; end: string }>) {
  const full = events.map((e) => ({ calendar: 'cal', title: e.id, ...e }));
  return upcomingFrom(expandEvents(full, '2026-11-11', '2026-11-18'), NOW);
}

describe('summarizeCalendar', () => {
  it('says nothing when the week is clear', () => {
    expect(summarizeCalendar([], NOW)).toBeNull();
  });

  it('leads with what is still to come today, and counts the rest', () => {
    const summary = summarizeCalendar(
      upcoming([
        { id: 'Breakfast', start: local(11, 8), end: local(11, 9) },
        { id: 'Dentist', start: local(11, 15), end: local(11, 16) },
        { id: 'Piano', start: local(11, 17), end: local(11, 18) },
        { id: 'Soccer', start: local(12, 16), end: local(12, 17) },
      ]),
      NOW,
    );
    // Breakfast is over; Dentist is next.
    expect(summary?.urgent).toBe(true);
    expect(summary?.headline).toMatch(/^Dentist at .*· 1 more today$/);
  });

  it('names an all-day event as today’s', () => {
    const summary = summarizeCalendar(
      upcoming([{ id: 'Book fair', all_day: true, start: '2026-11-11', end: '2026-11-11' }]),
      NOW,
    );
    expect(summary).toEqual({ headline: 'Book fair today', urgent: true });
  });

  it('points at the next event when today is clear', () => {
    const tomorrow = summarizeCalendar(
      upcoming([{ id: 'Soccer', start: local(12, 16), end: local(12, 17) }]),
      NOW,
    );
    expect(tomorrow).toEqual({ headline: 'Next: Soccer tomorrow' });
    const later = summarizeCalendar(
      upcoming([{ id: 'Recital', start: local(14, 16), end: local(14, 17) }]),
      NOW,
    );
    expect(later?.headline).toMatch(/^Next: Recital on \S+day$/);
    expect(later?.urgent).toBeUndefined();
  });
});
