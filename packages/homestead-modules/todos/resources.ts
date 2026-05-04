import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

export const todosResources: ResourceDefinition[] = [
  {
    singular: 'project',
    plural: 'projects',
    description: 'A todo project (e.g. Kitchen Remodel, Garden).',
    user_settable_create: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name.' },
        created_by: { type: 'string', description: 'users/{user_id}' },
      },
      required: ['name'],
    },
  },
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
        project: {
          type: 'string',
          description:
            'projects/{project_id}; empty/missing means the main project.',
        },
        in_main: {
          type: 'boolean',
          description:
            'When true, the todo also appears on the main project view (only meaningful when project is set).',
        },
      },
      required: ['title', 'status'],
    },
  },
];
