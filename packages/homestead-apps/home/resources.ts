import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const GARBAGE_PICKUPS = 'garbage-pickups' as const;
export const HOME_TASKS = 'home-tasks' as const;
export const DEVICE_INFOS = 'device-infos' as const;

/**
 * How a maintenance interval is counted. Singular on purpose — the UI reads
 * them as "every 3 month(s)" and pluralizes at render time, so the stored value
 * never has to agree with a count.
 */
export const HOME_TASK_INTERVAL_UNITS = ['day', 'week', 'month', 'year'] as const;

/**
 * Waste streams a pickup can belong to. Mirrors the hauler-side stream codes
 * (WM returns GARBAGE / RECYCLABLE / YARD_WASTE / ORGANIC / BULK / HAZARDOUS)
 * lowercased into the kebab-case aepbase enums want.
 */
export const GARBAGE_STREAMS = [
  'garbage',
  'recyclable',
  'yard-waste',
  'organic',
  'bulk',
  'hazardous',
] as const;

export const homeResources: ResourceDefinition[] = [
  {
    singular: 'garbage-pickup',
    plural: GARBAGE_PICKUPS,
    description:
      'One collection day for one waste stream. Garbage, recycling, and yard waste run on separate schedules, so a single calendar day is several records. Rows are normally written by an external sync (see `source`), but a household member can add one by hand.',
    user_settable_create: true,
    fields: {
      pickup_date: {
        type: 'string',
        format: 'date',
        required: true,
        description:
          'the day of collection as ISO YYYY-MM-DD, already holiday-adjusted. A plain date, not a timestamp — a pickup is a day, not an instant, and ISO dates sort lexically so order_by works.',
      },
      stream: {
        type: 'string',
        enum: GARBAGE_STREAMS,
        required: true,
        description: 'which waste stream is collected on this date',
      },
      status: {
        type: 'string',
        enum: ['scheduled', 'delayed'],
        default: 'scheduled',
        description:
          'delayed means a holiday pushed this pickup back; `original_date` holds the day it would otherwise have fallen on',
      },
      original_date: {
        type: 'string',
        format: 'date',
        description:
          'the pre-shift date when status is delayed; unset for a normal pickup',
      },
      note: {
        type: 'string',
        description:
          'short human explanation, e.g. "Thanksgiving — 1 day delay"',
      },
      service_description: {
        type: 'string',
        description:
          "the hauler's name for the service behind this pickup, e.g. \"96 Gallon Toter Recycle Limited\"",
      },
      // Distinguishes rows an automated sync owns from ones a person typed in.
      // The sync reconciles (and prunes) only its own rows, so a hand-entered
      // bulk-item pickup is never clobbered by the next run.
      source: {
        type: 'string',
        enum: ['manual', 'wm'],
        default: 'manual',
        description:
          'who wrote this row: `manual` (a household member) or a hauler sync such as `wm`',
      },
    },
  },
  {
    // A recurring chore the house needs: gutters cleaned, furnace filter
    // replaced, water heater flushed.
    //
    // The record is the *schedule*, not an occurrence: one row carries the
    // cadence (`interval_count` + `interval_unit`), when it next comes round
    // (`next_due`), and when it was last dealt with (`last_completed`). Marking
    // one done rewrites those two fields rather than appending a history row —
    // a household wants to know when the filter is next due, not to browse
    // every filter it has ever owned. `notes` is the other half of that: the
    // filter size, the gutter company's number, which breaker the sump pump is
    // on. It travels with the reminder because that is the moment you need it.
    //
    // Household-wide, like the pickup calendar: anyone can see and edit the
    // schedule. Who gets *told* is a per-user opt-in (`task_reminder`), so the
    // shared schedule doesn't imply a shared interruption.
    singular: 'home-task',
    plural: HOME_TASKS,
    description:
      'A recurring home maintenance task — what it is, how often it comes round, when it is next due, and whatever you need to know to do it (filter size, vendor, part number).',
    user_settable_create: true,
    fields: {
      name: {
        type: 'string',
        required: true,
        description: 'what needs doing, e.g. "Replace furnace filter"',
      },
      notes: {
        type: 'string',
        description:
          'anything worth having to hand when the reminder arrives — filter size, vendor phone number, part number, where the shutoff is',
      },
      interval_count: {
        type: 'integer',
        required: true,
        minimum: 1,
        default: 1,
        description: 'how many `interval_unit`s between occurrences',
      },
      interval_unit: {
        type: 'string',
        enum: HOME_TASK_INTERVAL_UNITS,
        required: true,
        default: 'month',
        description: 'the unit `interval_count` counts',
      },
      next_due: {
        type: 'string',
        format: 'date',
        required: true,
        description:
          'the day this is next due, ISO YYYY-MM-DD. A plain date, not a timestamp — upkeep is a day, not an instant, and ISO dates sort lexically so order_by works. Marking the task done moves this forward by one interval.',
      },
      last_completed: {
        type: 'string',
        format: 'date',
        description:
          'the day it was last done, ISO YYYY-MM-DD; unset until the first time',
      },
      lead_days: {
        type: 'integer',
        minimum: 0,
        maximum: 90,
        default: 0,
        description:
          'how many days before `next_due` the reminder goes out; 0 means the morning it is due',
      },
      paused: {
        type: 'boolean',
        default: false,
        description:
          'true to keep the record but stop reminding — the schedule is still there when you want it back',
      },
    },
  },
  {
    singular: 'device-info',
    plural: DEVICE_INFOS,
    description:
      'A household device that reports its own state (e.g. the fridge panel). ' +
      'Devices write this themselves; pick a stable id on create (`?id=fridge-panel`) ' +
      'and PATCH it on every report.',
    user_settable_create: true,
    fields: {
      name: { type: 'string', description: 'Display name, e.g. "Fridge panel".', required: true },
      battery_percent: {
        type: 'number',
        description: 'Last reported charge, 0–100. Missing when the device could not read it.',
        minimum: 0,
        maximum: 100,
      },
      charging: {
        type: 'boolean',
        description: 'True while the device reports it is on external power.',
      },
      low_threshold: {
        type: 'number',
        description:
          'Charge (percent) at or below which a "charge this" todo is raised. Defaults to 20 when unset.',
        minimum: 1,
        maximum: 90,
      },
      firmware: { type: 'string', description: 'Firmware or software version the device runs.' },
      reported_at: {
        type: 'string',
        format: 'date-time',
        description: 'RFC3339 time of the device’s last report.',
      },
      low_battery_alerted: {
        type: 'boolean',
        description:
          'Set by Homestead once a low-battery reminder has gone out; cleared when the device is recharged. Devices should not write it.',
      },
      charge_todo: {
        type: 'string',
        description: 'The open "charge this device" todo, if any. Managed by Homestead.',
        reference: { resource: 'todo', onDelete: 'set-null' },
      },
    },
  },
];
