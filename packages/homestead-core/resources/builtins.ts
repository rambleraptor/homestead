/**
 * Resource definitions that aren't owned by a feature module.
 *
 * These cover platform-level concerns: per-user preferences and the
 * generic action/run pair used by the actions runtime. Kept in core
 * so the runner has a single, deterministic list to apply alongside
 * the per-module definitions.
 *
 * Note: `module-flag` is *not* listed here. Its schema is generated
 * from declared module flags by `syncModuleFlagsSchema` and applied
 * separately on Next.js boot.
 */

import type { ResourceDefinition } from './types';

export const BUILTIN_RESOURCE_DEFS: ResourceDefinition[] = [
  {
    singular: 'user-preference',
    plural: 'user-preferences',
    description:
      'Per-user app preferences. Currently holds map_provider; extend as new user-scoped settings appear.',
    user_settable_create: true,
    parents: ['user'],
    schema: {
      type: 'object',
      properties: {
        map_provider: {
          type: 'string',
          description: 'one of: google, apple',
        },
      },
    },
  },
  {
    singular: 'action',
    plural: 'actions',
    description:
      'A user-defined automation backed by a server-side script.',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        script_id: { type: 'string' },
        parameters: { type: 'object' },
        last_run_at: { type: 'string', format: 'date-time' },
        created_by: { type: 'string' },
      },
      required: ['name', 'script_id'],
    },
  },
  {
    singular: 'run',
    plural: 'runs',
    description: 'A single execution of an action.',
    user_settable_create: true,
    parents: ['action'],
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        started_at: { type: 'string', format: 'date-time' },
        completed_at: { type: 'string', format: 'date-time' },
        duration_ms: { type: 'number' },
        error: { type: 'string' },
        result: { type: 'object' },
        input_request: { type: 'object' },
        input_response: { type: 'object' },
      },
      required: ['status'],
    },
  },
];
