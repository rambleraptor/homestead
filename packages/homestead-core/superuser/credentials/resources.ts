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
      kind: {
        type: 'string',
        enum: ['token', 'oauth'],
        default: 'token',
        description: 'token: a value you paste. oauth: a sign-in Homestead keeps fresh (MCP servers).',
      },
      // A `token` credential's value. An `oauth` one has none.
      value: { type: 'string', secret: { hint: 4 } },
      oauth_client_id: {
        type: 'string',
        maxLength: 500,
        description: 'A pre-registered OAuth client, for servers that don’t register one themselves.',
      },
      oauth_client_secret: { type: 'string', secret: true },
      oauth_scope: { type: 'string', maxLength: 1000, description: 'Scopes to ask for, space-separated.' },
      oauth_resource: {
        type: 'string',
        maxLength: 2000,
        description: 'The server address the sign-in is for. Its tokens go nowhere else.',
      },
      // Server-written: tokens, a registered client, the discovered sign-in server.
      oauth_state: { type: 'object', secret: true },
      oauth_connected_at: { type: 'string', format: 'date-time' },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
];

/** Fields a token credential's forms leave out: the OAuth kind is set up from MCP servers. */
export const OAUTH_FIELDS = [
  'kind',
  'oauth_client_id',
  'oauth_client_secret',
  'oauth_scope',
  'oauth_resource',
  'oauth_connected_at',
] as const;
