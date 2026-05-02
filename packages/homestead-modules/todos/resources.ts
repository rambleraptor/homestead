import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const todosResources: ResourceDefinition[] = [
  {
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
  },
];
