import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const EVENTS = 'events' as const;

export const eventsResources: ResourceDefinition[] = [
  {
    singular: 'event',
    plural: EVENTS,
    description:
      'A yearly-recurring event. Either a fixed month/day (default) or the Nth weekday of a month (e.g., second Sunday of May).',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        date: { type: 'string', format: 'date-time' },
        tag: {
          type: 'string',
          description: 'free-form; common values: birthday, anniversary',
        },
        people: {
          type: 'array',
          items: { type: 'string' },
          description: 'array of people/{person_id} reference strings',
        },
        recurrence: {
          type: 'string',
          description: 'one of: yearly (default), yearly-nth-weekday',
        },
        recurrence_rule: {
          type: 'string',
          description:
            "for yearly-nth-weekday: '<n>:<weekday>' where n is 1..4 or -1 (last) and weekday is 0=Sun..6=Sat. Month comes from `date`. Example: '2:0' = 2nd Sunday.",
        },
        created_by: { type: 'string', description: 'users/{user_id}' },
      },
      required: ['name', 'date'],
    },
  },
];
