/**
 * Events module types.
 *
 * The `tag` field is free-form on the wire (aepbase strips JSON-schema
 * enums on round-trip). The form constrains values UI-side via
 * `KNOWN_EVENT_TAGS`.
 */

export type KnownEventTag = 'birthday' | 'anniversary';

export const KNOWN_EVENT_TAGS: readonly KnownEventTag[] = [
  'birthday',
  'anniversary',
] as const;

export type EventRecurrence = 'yearly' | 'yearly-nth-weekday';

export interface Event {
  id: string;
  name: string;
  /**
   * ISO date string. For fixed-date yearly events (default), only month/day
   * are honored. For `yearly-nth-weekday` events, only the month is honored
   * and the day-of-month is ignored — `recurrence_rule` controls which
   * weekday and occurrence.
   */
  date: string;
  tag?: string;
  /** Array of `people/{person_id}` reference strings. */
  people?: string[];
  recurrence?: EventRecurrence;
  /**
   * For `yearly-nth-weekday`: `<n>:<weekday>` where n is 1..4 or -1 (last)
   * and weekday is 0=Sun..6=Sat. Example: `"2:0"` = 2nd Sunday.
   */
  recurrence_rule?: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

export interface EventFormData {
  name: string;
  date: string;
  tag?: string;
  /** Bare person ids — `people/` prefix is added on submit. */
  people: string[];
  recurrence?: EventRecurrence;
  recurrence_rule?: string;
}
