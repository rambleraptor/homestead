/**
 * aepbase resource definitions for the todos module.
 *
 * Source of truth — synced to aepbase by
 * `frontend/scripts/apply-schema.ts`. Equivalent to
 * `aepbase/terraform/todos.tf`.
 */

import type { AepResourceDefinition } from '../../core/aep/types';

const todo: AepResourceDefinition = {
  singular: 'todo',
  plural: 'todos',
  description: 'A household todo item.',
  user_settable_create: true,
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Todo title.' },
      status: {
        type: 'string',
        description:
          'one of: pending, in_progress, do_later, completed, cancelled',
      },
      created_by: { type: 'string', description: 'users/{user_id}' },
    },
    required: ['title', 'status'],
  },
};

export const todosResources: AepResourceDefinition[] = [todo];
