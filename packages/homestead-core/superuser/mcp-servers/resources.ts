import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { TOOL_POLICIES } from './tools';

export const MCP_SERVERS = 'mcp-servers' as const;

/**
 * An external MCP server the household assistant may use, on a shared
 * household account: Home Assistant, a calendar, anything that speaks
 * Streamable HTTP.
 *
 * Superusers add and configure servers (`superuser_write`), and nobody else
 * can see one until a superuser shares it with a group — the household roles
 * get no grant on the collection (`access: superusers`), so a share is the only
 * way in. Its token lives in a `credential`, referenced here and never copied.
 * The tool list is what the server last reported (`:refresh-tools`), each with
 * the household's policy for it; a tool the server adds later starts `off`,
 * so its description is reviewed before it ever reaches a prompt.
 */
export const mcpServersResources: ResourceDefinition[] = [
  {
    singular: 'mcp-server',
    plural: MCP_SERVERS,
    description:
      'An external MCP server the household assistant can use, on a shared household account.',
    superuser_write: true,
    access: { model: 'superusers' },
    modelTools: { chat: false, mcp: false },
    fields: {
      name: { type: 'string', required: true, maxLength: 100 },
      url: {
        type: 'string',
        required: true,
        maxLength: 2000,
        pattern: '^https?://',
        description: 'Streamable HTTP endpoint, e.g. http://homeassistant.local:8123/api/mcp',
      },
      credential: {
        type: 'string',
        reference: { resource: 'credential', onDelete: 'restrict' },
        description: 'The credential holding the bearer token sent to the server, if it needs one.',
      },
      instructions: {
        type: 'string',
        description: 'What the server says about itself when it connects.',
      },
      tools: {
        type: 'array',
        description: 'The tools the server last reported, with the household policy for each.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', required: true },
            title: { type: 'string' },
            description: { type: 'string' },
            read_only: { type: 'boolean', description: 'The server marks it read-only.' },
            policy: { type: 'string', enum: [...TOOL_POLICIES], required: true },
          },
        },
      },
      status: { type: 'string', enum: ['untested', 'ok', 'failing'], default: 'untested' },
      last_error: { type: 'string' },
      last_checked_at: { type: 'string', format: 'date-time' },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
    customMethods: {
      'refresh-tools': {
        target: 'item',
        description:
          'Connect to the server and fetch its tools. New tools start off; existing ones keep their policy.',
        load: () => import('./methods/refresh-tools'),
      },
    },
  },
];
