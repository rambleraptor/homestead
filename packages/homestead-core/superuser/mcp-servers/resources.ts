import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';
import { TOOL_POLICIES } from './tools';

export const MCP_SERVERS = 'mcp-servers' as const;
export const MCP_CALLS = 'mcp-calls' as const;

/** Outcomes of a call through the broker (`server/mcp/broker.ts`). */
export const MCP_CALL_OUTCOMES = ['ok', 'error', 'denied', 'refused'] as const;

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
            input_schema: {
              type: 'object',
              description:
                'The JSON schema of the tool’s arguments as the server reported it at the last check — ' +
                'what the assistant is given, so a turn never depends on the server’s word since.',
            },
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
      'call-tool': {
        target: 'item',
        description:
          'Call one of the server’s tools as yourself: the same checks and log as the assistant’s calls. ' +
          'Calling it is your approval, so "ask first" tools run.',
        request: {
          type: 'object',
          required: ['tool'],
          properties: {
            tool: { type: 'string', description: 'The tool’s name, as the server reports it.' },
            arguments: { type: 'object', description: 'The tool’s arguments.' },
          },
        },
        load: () => import('./methods/call-tool'),
      },
      'refresh-tools': {
        target: 'item',
        description:
          'Connect to the server and fetch its tools. New tools start off; existing ones keep their policy.',
        load: () => import('./methods/refresh-tools'),
      },
    },
  },
  {
    singular: 'mcp-call',
    plural: MCP_CALLS,
    description:
      'One call Homestead made to a tool on an MCP server: who it was for, what it did, and how it went.',
    // Written by the server (a system token), read by superusers only — members
    // can't see others' calls, nor delete their own.
    superuser_write: true,
    access: { model: 'superusers' },
    modelTools: { chat: false, mcp: false },
    retention: { days: 90, field: 'create_time' },
    fields: {
      server: {
        type: 'string',
        reference: { resource: 'mcp-server', onDelete: 'set-null' },
      },
      server_name: { type: 'string', description: 'The server’s name at the time, kept if it’s deleted.' },
      tool: { type: 'string', required: true },
      caller: {
        type: 'string',
        reference: { resource: 'user' },
        description: 'Who the call was for.',
      },
      conversation: {
        type: 'string',
        reference: { resource: 'conversation', onDelete: 'set-null' },
        description: 'The conversation it came from, when the assistant made it.',
      },
      arguments: { type: 'string', maxLength: 1000, description: 'The arguments, summarized.' },
      outcome: { type: 'string', enum: [...MCP_CALL_OUTCOMES], required: true },
      error: { type: 'string', maxLength: 1000 },
      duration_ms: { type: 'integer', minimum: 0 },
    },
  },
];
