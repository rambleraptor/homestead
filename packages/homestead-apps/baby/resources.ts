import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const BABIES = 'babies' as const;
/** Child collection: `/babies/{id}/baby-events`. */
export const BABY_EVENTS = 'baby-events' as const;

export const EVENT_KINDS = ['feed', 'diaper', 'sleep'] as const;
export const FEED_METHODS = ['breast', 'bottle'] as const;
export const SIDES = ['left', 'right', 'both'] as const;
export const VOLUME_UNITS = ['oz', 'ml'] as const;
export const BOTTLE_CONTENTS = ['breast_milk', 'formula'] as const;
export const DIAPER_KINDS = ['wet', 'dirty', 'both'] as const;

export const babyResources: ResourceDefinition[] = [
  {
    singular: 'baby',
    plural: BABIES,
    description:
      'A baby the household is caring for. Feeds, diapers and sleep are logged ' +
      'under it as baby-events. Shared with the whole household.',
    user_settable_create: true,
    fields: {
      name: { type: 'string', required: true, description: 'What the baby is called.' },
      birth_date: {
        type: 'string',
        format: 'date',
        description: 'Date of birth as ISO YYYY-MM-DD. Unset until the baby arrives.',
      },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    singular: 'baby-event',
    plural: BABY_EVENTS,
    parents: ['baby'],
    description:
      'One logged feed, diaper change or sleep of a baby. `kind` says which; the ' +
      'feed_*, diaper and ended_at fields apply only to the matching kind.',
    user_settable_create: true,
    fields: {
      kind: { type: 'string', enum: [...EVENT_KINDS], required: true },
      started_at: {
        type: 'string',
        format: 'date-time',
        // An entry logged with no signal keeps the time it was tapped.
        stamp: 'create',
        description:
          'When it happened (a feed or sleep: when it began), as a UTC RFC 3339 ' +
          'timestamp. Events are ordered by it. Leave it out to mean now.',
      },
      ended_at: {
        type: 'string',
        format: 'date-time',
        description:
          'When a sleep or a timed breast feed ended, as a UTC RFC 3339 timestamp. ' +
          'Unset on a sleep means the baby is still asleep.',
      },
      feed_method: {
        type: 'string',
        enum: [...FEED_METHODS],
        description: 'Feeds only: at the breast or from a bottle.',
      },
      side: {
        type: 'string',
        enum: [...SIDES],
        description: 'Breast feeds only: which side.',
      },
      amount: {
        type: 'number',
        description: 'Bottle feeds only: how much was taken, in amount_unit, as the person said it.',
      },
      amount_unit: {
        type: 'string',
        enum: [...VOLUME_UNITS],
        description: 'The unit of amount. Never convert: store the number and unit the person gave.',
      },
      contents: {
        type: 'string',
        enum: [...BOTTLE_CONTENTS],
        description: 'Bottle feeds only: what was in the bottle.',
      },
      diaper: {
        type: 'string',
        enum: [...DIAPER_KINDS],
        description: 'Diaper changes only: wet, dirty, or both.',
      },
      notes: { type: 'string' },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
];
