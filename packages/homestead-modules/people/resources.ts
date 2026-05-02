import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const peopleResources: ResourceDefinition[] = [
  {
    singular: 'person',
    plural: 'people',
    description:
      'A person tracked by the household (family, friend, contact).',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        birthday: { type: 'string', format: 'date-time' },
        created_by: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    singular: 'person-shared-data',
    plural: 'person-shared-data',
    description:
      "Data shared between two people (e.g. a couple's shared address or anniversary).",
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        person_a: { type: 'string', description: 'people/{person_id}' },
        person_b: { type: 'string', description: 'people/{person_id}' },
        address_id: { type: 'string' },
        anniversary: { type: 'string', format: 'date-time' },
        created_by: { type: 'string' },
      },
      required: ['person_a'],
    },
  },
  {
    singular: 'address',
    plural: 'addresses',
    description:
      'A physical address, optionally with WiFi credentials, optionally shared between people.',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        line1: { type: 'string' },
        line2: { type: 'string' },
        city: { type: 'string' },
        state: { type: 'string' },
        postal_code: { type: 'string' },
        country: { type: 'string' },
        wifi_network: { type: 'string' },
        wifi_password: { type: 'string' },
        shared_data_id: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['line1', 'created_by'],
    },
  },
];
