/**
 * The event form's working copy.
 *
 * An event stores instants (or plain dates) and a rule; a person types a day,
 * a time, and picks "every week". The draft is that typed shape, and this file
 * is the only place that converts between the two — in the viewer's local time,
 * which is what the date and time inputs show.
 */

import type { CalendarEvent, Occurrence } from '../types';
import { addDays, isDay, isoDay } from './dates';
import { buildRRule, presetOf, untilDayOf, type RepeatPreset } from './recurrence';

export interface EventDraft {
  calendar: string;
  title: string;
  allDay: boolean;
  /** `YYYY-MM-DD`. */
  startDay: string;
  /** `HH:mm`; kept while `allDay` so unticking the box restores it. */
  startTime: string;
  endDay: string;
  endTime: string;
  repeat: RepeatPreset;
  /** Last day of the repetition, or '' for no end. */
  untilDay: string;
  location: string;
  notes: string;
}

export type DraftErrors = Partial<Record<keyof EventDraft, string>>;

const pad = (n: number) => String(n).padStart(2, '0');

function timeOf(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A blank event on `day`: an hour long, starting at the next full hour. */
export function draftForNew(day: string, calendar: string, now: Date = new Date()): EventDraft {
  const startHour = Math.min(now.getHours() + 1, 23);
  return {
    calendar,
    title: '',
    allDay: false,
    startDay: day,
    startTime: `${pad(startHour)}:00`,
    endDay: day,
    endTime: startHour === 23 ? '23:59' : `${pad(startHour + 1)}:00`,
    repeat: 'none',
    untilDay: '',
    location: '',
    notes: '',
  };
}

/**
 * The draft for editing `event`. Given an `occurrence`, the draft is that one
 * showing of a series — its own day and time, not repeating — for a "just this
 * one" edit.
 */
export function draftFromEvent(event: CalendarEvent, occurrence?: Occurrence): EventDraft {
  const base = {
    calendar: event.calendar,
    title: event.title,
    repeat: occurrence ? ('none' as const) : presetOf(event.rrule),
    untilDay: occurrence ? '' : untilDayOf(event.rrule),
    location: event.location ?? '',
    notes: event.notes ?? '',
  };
  if (event.all_day) {
    const startDay = occurrence?.startDay ?? event.start;
    const endDay = occurrence?.endDay ?? (isDay(event.end) ? event.end : event.start);
    return { ...base, allDay: true, startDay, endDay, startTime: '09:00', endTime: '10:00' };
  }
  const start = occurrence?.start ?? new Date(event.start);
  const end = occurrence?.end ?? new Date(event.end);
  return {
    ...base,
    allDay: false,
    startDay: isoDay(start),
    startTime: timeOf(start),
    endDay: isoDay(end),
    endTime: timeOf(end),
  };
}

function localInstant(day: string, time: string): Date {
  return new Date(`${day}T${time}`);
}

export function validateDraft(draft: EventDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.title.trim()) errors.title = 'Give the event a title.';
  if (!draft.calendar) errors.calendar = 'Choose a calendar.';
  if (!isDay(draft.startDay)) errors.startDay = 'Choose a start date.';
  if (!isDay(draft.endDay)) errors.endDay = 'Choose an end date.';
  if (errors.startDay || errors.endDay) return errors;

  if (draft.allDay) {
    if (draft.endDay < draft.startDay) errors.endDay = 'The end can’t be before the start.';
  } else {
    if (!draft.startTime) errors.startTime = 'Choose a start time.';
    if (!draft.endTime) errors.endTime = 'Choose an end time.';
    if (!errors.startTime && !errors.endTime) {
      const start = localInstant(draft.startDay, draft.startTime).getTime();
      const end = localInstant(draft.endDay, draft.endTime).getTime();
      if (Number.isNaN(start)) errors.startTime = 'Choose a start time.';
      else if (Number.isNaN(end)) errors.endTime = 'Choose an end time.';
      else if (end < start) errors.endDay = 'The end can’t be before the start.';
    }
  }
  if (draft.repeat !== 'none' && draft.repeat !== 'custom' && draft.untilDay) {
    if (!isDay(draft.untilDay) || draft.untilDay < draft.startDay) {
      errors.untilDay = 'Repeating can’t end before the first event.';
    }
  }
  return errors;
}

/** The stored fields a valid draft stands for (everything but the calendar). */
export interface EventFields {
  title: string;
  all_day: boolean;
  start: string;
  end: string;
  timezone: string;
  location: string | null;
  notes: string | null;
  rrule: string | null;
}

/**
 * Convert a valid draft to stored fields. `existingRrule` is kept verbatim for
 * a rule the form doesn't know how to edit (`custom`). Empty text and "does
 * not repeat" become `null`, which clears the field on an update.
 */
export function draftToFields(
  draft: EventDraft,
  timezone: string,
  existingRrule?: string,
): EventFields {
  const rrule =
    draft.repeat === 'custom'
      ? (existingRrule ?? null)
      : (buildRRule(draft.repeat, draft.untilDay || undefined) ?? null);
  return {
    title: draft.title.trim(),
    all_day: draft.allDay,
    start: draft.allDay
      ? draft.startDay
      : localInstant(draft.startDay, draft.startTime).toISOString(),
    end: draft.allDay ? draft.endDay : localInstant(draft.endDay, draft.endTime).toISOString(),
    timezone,
    location: draft.location.trim() || null,
    notes: draft.notes.trim() || null,
    rrule,
  };
}

/**
 * Move a start by the same amount a series' own start moved, so the skipped
 * and replaced occurrences recorded against the old times still line up with
 * the new ones. Returns null when the two starts aren't the same kind (a
 * series switched between timed and all-day), where nothing lines up any more.
 */
export function shiftStart(value: string, oldStart: string, newStart: string): string | null {
  const days = isDay(oldStart) && isDay(newStart);
  if (days) {
    if (!isDay(value)) return null;
    const moved = Math.round(
      (Date.parse(`${newStart}T00:00:00Z`) - Date.parse(`${oldStart}T00:00:00Z`)) / 86_400_000,
    );
    return addDays(value, moved);
  }
  if (isDay(oldStart) || isDay(newStart) || isDay(value)) return null;
  const moved = Date.parse(newStart) - Date.parse(oldStart);
  const at = Date.parse(value);
  return Number.isNaN(moved) || Number.isNaN(at) ? null : new Date(at + moved).toISOString();
}
