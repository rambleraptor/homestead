import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const PEOPLE = 'people' as const;
export const PERSON_SHARED_DATA = 'person-shared-data' as const;
export const ADDRESSES = 'addresses' as const;

export const peopleResources: ResourceDefinition[] = [
  {
    singular: 'person',
    plural: PEOPLE,
    description:
      'A person tracked by the household (family, friend, contact).',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    singular: 'person-shared-data',
    plural: PERSON_SHARED_DATA,
    description:
      "Data shared between two people (e.g. a couple's shared address).",
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        person_a: { type: 'string', description: 'people/{person_id}' },
        person_b: { type: 'string', description: 'people/{person_id}' },
        address_id: { type: 'string' },
        created_by: { type: 'string' },
      },
      required: ['person_a'],
    },
  },
  {
    singular: 'address',
    plural: ADDRESSES,
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
