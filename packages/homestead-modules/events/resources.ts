import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const EVENTS = 'events' as const;

export const eventsResources: ResourceDefinition[] = [
  {
    singular: 'event',
    plural: EVENTS,
    description:
      'A yearly-recurring date (e.g., birthday, anniversary). Only month/day are honored when computing the next occurrence.',
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
        created_by: { type: 'string', description: 'users/{user_id}' },
      },
      required: ['name', 'date'],
    },
  },
];
