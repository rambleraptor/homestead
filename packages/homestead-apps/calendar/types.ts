/**
 * Calendar app types.
 *
 * `color` is declared as an enum in `resources.ts`, but aepbase strips
 * JSON-schema enums on round-trip — treat a value read off the wire as
 * untrusted and fall back gracefully (see `colorClasses`).
 */

import type { CALENDAR_COLORS } from './resources';

export type CalendarColor = (typeof CALENDAR_COLORS)[number];

export interface Calendar {
  id: string;
  path?: string;
  name: string;
  color: CalendarColor;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

export interface CalendarFormData {
  name: string;
  color: CalendarColor;
  created_by?: string;
}

export interface CalendarEvent {
  id: string;
  path?: string;
  /**
   * The parent calendar's id. Not stored on the record — the parent lives in
   * the URL — but the list hook fills it in so the views can join by it, and
   * the mutation factory reads it to address a create.
   */
  calendar: string;
  title: string;
  all_day?: boolean;
  /** UTC instant, or `YYYY-MM-DD` when `all_day`. */
  start: string;
  /** Same form as `start`; inclusive last day when `all_day`. */
  end: string;
  timezone?: string;
  location?: string;
  notes?: string;
  rrule?: string;
  exdates?: string[];
  /** On a changed single occurrence: the repeating event it belongs to. */
  series?: string;
  original_start?: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

/** What a create sends. `calendar` picks the parent; the factory strips it from the body. */
export interface CalendarEventFormData {
  calendar: string;
  title: string;
  all_day: boolean;
  start: string;
  end: string;
  timezone?: string;
  location?: string | null;
  notes?: string | null;
  rrule?: string | null;
  exdates?: string[] | null;
  series?: string;
  original_start?: string;
  created_by?: string;
}

/**
 * One concrete showing of an event: the event itself, or one repetition of a
 * series. Everything a view needs to place and label it, already in the
 * viewer's local time.
 */
export interface Occurrence {
  /** Stable across renders: the event id plus the occurrence's own start. */
  key: string;
  event: CalendarEvent;
  allDay: boolean;
  start: Date;
  end: Date;
  /** First and last local day it touches, `YYYY-MM-DD`. */
  startDay: string;
  endDay: string;
  /**
   * The start this occurrence has in the event's own terms (an instant, or a
   * date when all-day) — what goes in `exdates` to skip it, or in
   * `original_start` to replace it.
   */
  originalStart: string;
  /** True when it comes from a repeating series (so "this one" and "all" differ). */
  recurring: boolean;
}
