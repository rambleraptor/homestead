import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const CREDENTIALS = 'credentials' as const;

/**
 * A secret Homestead uses on the household's behalf — an API key, a token. Its
 * `value` is a `secret` field: set or replaced through the API, never read
 * back by anyone (reads get a descriptor). Server code that uses one reads it
 * in-process (`@rambleraptor/homestead-core/server/credentials`).
 *
 * Superusers only, end to end: no household grant (`access`), superuser-only
 * writes, and out of the model tools — the assistant doesn't learn they exist.
 */
export const credentialsResources: ResourceDefinition[] = [
  {
    singular: 'credential',
    plural: CREDENTIALS,
    description:
      'A secret Homestead uses on the household’s behalf, such as an API key or token. ' +
      'Its value can be set or replaced but never read back.',
    superuser_write: true,
    access: { model: 'superusers' },
    modelTools: { chat: false, mcp: false },
    fields: {
      name: { type: 'string', required: true, maxLength: 100 },
      description: { type: 'string', maxLength: 500 },
      value: { type: 'string', required: true, secret: { hint: 4 } },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
];
