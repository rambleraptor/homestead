import { describe, expect, it } from 'vitest';
import { summarizeUpcoming } from '../hooks/useUpcomingEventsSummary';
import { daysFromToday, eventPhrase, relativeDay } from '../utils/upcoming';

const NOW = new Date(2026, 5, 15, 9, 30); // June 15, 2026, mid-morning
const onDay = (offset: number) => new Date(2026, 5, 15 + offset, 0, 0);

describe('daysFromToday', () => {
  it('counts calendar days, not 24-hour spans', () => {
    expect(daysFromToday(onDay(0), NOW)).toBe(0);
    expect(daysFromToday(onDay(1), NOW)).toBe(1);
    expect(daysFromToday(onDay(-1), NOW)).toBe(-1);
  });
});

describe('relativeDay', () => {
  it('reads naturally', () => {
    expect(relativeDay(0)).toBe('today');
    expect(relativeDay(1)).toBe('tomorrow');
    expect(relativeDay(3)).toBe('in 3 days');
  });
});

describe('eventPhrase', () => {
  it("is possessive for a person's birthday or a couple's anniversary", () => {
    expect(eventPhrase({ name: 'Bday', names: ['Sam'], tag: 'birthday' })).toBe("Sam's birthday");
    expect(eventPhrase({ name: 'Wedding', names: ['Sam', 'Alex'], tag: 'anniversary' })).toBe(
      "Sam & Alex's anniversary",
    );
    expect(eventPhrase({ name: 'Bday', names: ['Chris'], tag: 'birthday' })).toBe(
      "Chris' birthday",
    );
  });

  it('falls back to the event name', () => {
    expect(eventPhrase({ name: "Mother's Day", names: [], tag: undefined })).toBe("Mother's Day");
    expect(eventPhrase({ name: 'Graduation', names: ['Sam'], tag: 'graduation' })).toBe(
      'Graduation',
    );
  });
});

describe('summarizeUpcoming', () => {
  it('says nothing when the week is clear', () => {
    expect(summarizeUpcoming([], NOW)).toBeNull();
  });

  it('leads with today, urgently', () => {
    expect(
      summarizeUpcoming(
        [
          { name: 'Bday', names: ['Sam'], tag: 'birthday', date: onDay(0) },
          { name: 'Picnic', names: [], date: onDay(4) },
        ],
        NOW,
      ),
    ).toEqual({ headline: "Sam's birthday today", urgent: true });
  });

  it('counts the rest of the day', () => {
    expect(
      summarizeUpcoming(
        [
          { name: 'Bday', names: ['Sam'], tag: 'birthday', date: onDay(0) },
          { name: 'Picnic', names: [], date: onDay(0) },
        ],
        NOW,
      ),
    ).toEqual({ headline: "Sam's birthday today · 1 more", urgent: true });
  });

  it('otherwise names the next one and when', () => {
    expect(
      summarizeUpcoming([{ name: 'Bday', names: ['Sam'], tag: 'birthday', date: onDay(3) }], NOW),
    ).toEqual({ headline: "Next: Sam's birthday in 3 days" });
    expect(summarizeUpcoming([{ name: 'Picnic', names: [], date: onDay(1) }], NOW)).toEqual({
      headline: 'Next: Picnic tomorrow',
    });
  });
});
