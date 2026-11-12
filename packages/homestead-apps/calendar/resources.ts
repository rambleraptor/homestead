import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const CALENDARS = 'calendars' as const;
export const CALENDAR_EVENTS = 'calendar-events' as const;

/** The colours a calendar can take. Named, so the palette can change without touching data. */
export const CALENDAR_COLORS = [
  'blue',
  'green',
  'red',
  'orange',
  'purple',
  'pink',
  'teal',
  'yellow',
  'gray',
] as const;

export const calendarResources: ResourceDefinition[] = [
  {
    singular: 'calendar',
    plural: CALENDARS,
    description:
      'A named, coloured set of events — "Family", "Alex", "School". Events live under a calendar, so sharing or hiding a calendar shares or hides everything on it.',
    user_settable_create: true,
    fields: {
      name: { type: 'string', required: true },
      color: {
        type: 'string',
        enum: CALENDAR_COLORS,
        required: true,
        description: 'the colour its events are drawn in',
      },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    // One event, or one repeating series.
    //
    // A timed event stores `start`/`end` as UTC instants and remembers the zone
    // it was written in, so "every Tuesday at 9" stays at 9 across a clock
    // change. An all-day event stores plain dates instead: a birthday party is
    // a day, not an instant, and must not slide when viewed from another zone.
    // Both forms sort and compare as text.
    //
    // A series is one record carrying an RFC 5545 rule; its occurrences are
    // worked out on read (`utils/occurrences.ts`), never stored. Skipping one
    // adds its start to `exdates`. Changing one writes a second record that
    // points back through `series` and names the occurrence it replaces in
    // `original_start` — the same model Google Calendar and iCalendar use, so
    // a later sync has nothing to translate.
    singular: 'calendar-event',
    plural: CALENDAR_EVENTS,
    parents: ['calendar'],
    description:
      'An event on a calendar, or a repeating series of them. Timed events use UTC instants for start/end plus the IANA timezone they were written in; all-day events use plain YYYY-MM-DD dates with an inclusive end.',
    user_settable_create: true,
    fields: {
      title: { type: 'string', required: true },
      all_day: {
        type: 'boolean',
        default: false,
        description:
          'true when the event covers whole days; start and end are then YYYY-MM-DD dates',
      },
      start: {
        type: 'string',
        required: true,
        description:
          'when it begins: a UTC RFC 3339 instant (2026-11-12T17:00:00.000Z), or a YYYY-MM-DD date when all_day',
      },
      end: {
        type: 'string',
        required: true,
        description:
          'when it ends, in the same form as start. For an all-day event this is the last day, inclusive (a one-day event has end equal to start)',
      },
      timezone: {
        type: 'string',
        description:
          'IANA zone the event was written in, e.g. America/Los_Angeles. A repeating timed event keeps its wall-clock time in this zone',
      },
      location: { type: 'string' },
      notes: { type: 'string' },
      rrule: {
        type: 'string',
        description:
          'RFC 5545 recurrence rule without the RRULE: prefix, e.g. FREQ=WEEKLY;BYDAY=TU,TH or FREQ=MONTHLY;UNTIL=20270601. Unset for a one-off event',
      },
      exdates: {
        type: 'array',
        items: { type: 'string' },
        description:
          'occurrences of a repeating event that are skipped, each given as the start it would have had (same form as start)',
      },
      series: {
        type: 'string',
        description:
          'set on a changed single occurrence: the repeating event it belongs to',
        reference: { resource: 'calendar-event', onDelete: 'cascade' },
      },
      original_start: {
        type: 'string',
        description:
          'with series: the start of the occurrence this record replaces (same form as start)',
      },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
];
