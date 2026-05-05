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

export interface Event {
  id: string;
  name: string;
  /** ISO date string. Only month/day are honored when computing recurrence. */
  date: string;
  tag?: string;
  /** Array of `people/{person_id}` reference strings. */
  people?: string[];
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
}
