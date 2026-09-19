import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

/**
 * Collection plural identifiers — the URL segment aepbase uses for each
 * resource. Hooks should import these directly so renaming a collection
 * is a single-file change.
 */
export const TODOS = 'todos' as const;
export const PERSONAL_TODOS = 'personal-todos' as const;
export const PROJECTS = 'projects' as const;
export const CATEGORIES = 'categories' as const;
export const LIST_TEMPLATES = 'list-templates' as const;
export const TEMPLATE_ITEMS = 'template-items' as const;
export const TEMPLATE_CATEGORIES = 'template-categories' as const;

export const todosResources: ResourceDefinition[] = [
  {
    singular: 'project',
    plural: PROJECTS,
    description: 'A todo project (e.g. Kitchen Remodel, Garden).',
    user_settable_create: true,
    fields: {
      name: { type: 'string', description: 'Project name.', required: true },
      created_by: { type: 'string', reference: { resource: 'user' } },
      temporary: {
        type: 'boolean',
        description:
          'When true, the list is deleted (with its todos) as soon as every item in it is checked off. Set on lists created from a template.',
      },
    },
  },
  {
    singular: 'todo',
    plural: TODOS,
    description: 'A household todo item.',
    user_settable_create: true,
    fields: {
      title: { type: 'string', description: 'Todo title.', required: true },
      status: {
        type: 'string',
        enum: ['pending', 'do_later', 'completed', 'cancelled'],
        required: true,
      },
      created_by: { type: 'string', reference: { resource: 'user' } },
      project: {
        type: 'string',
        description: 'empty/missing means the main project.',
        reference: { resource: 'project', onDelete: 'restrict' },
      },
      in_main: {
        type: 'boolean',
        description:
          'When true, the todo also appears on the main project view (only meaningful when project is set).',
      },
      category: {
        type: 'string',
        description:
          'Optional grouping within the project list. Empty/missing means uncategorized.',
        reference: { resource: 'category', onDelete: 'set-null' },
      },
    },
  },
  {
    singular: 'category',
    plural: CATEGORIES,
    parents: ['project'],
    description:
      'A named grouping of todos within a project list (e.g. "Food", "Decorations").',
    user_settable_create: true,
    fields: {
      name: { type: 'string', description: 'Category name.', required: true },
      position: {
        type: 'number',
        description: 'Sort order within the project (ascending).',
      },
    },
  },
  {
    singular: 'personal-todo',
    plural: PERSONAL_TODOS,
    parents: ['user'],
    description:
      "A private, per-user todo item. Scoped to its owner by the user parent — " +
      'only the owner (and superusers) can read or write it. Like the shared ' +
      '`todo` resource it can be filed under a project list, but only its owner ' +
      'ever sees it there.',
    user_settable_create: true,
    fields: {
      title: { type: 'string', description: 'Todo title.', required: true },
      status: {
        type: 'string',
        enum: ['pending', 'do_later', 'completed', 'cancelled'],
        required: true,
      },
      project: {
        type: 'string',
        description: 'empty/missing means the main list.',
        // Deliberately no `onDelete`, unlike `todo.project`. A private todo is
        // invisible to everyone but its owner, so a `restrict` would let one
        // household member's private item block another member from deleting a
        // shared list — with no way to see why. The client clears the deleter's
        // own private todos (see useDeleteProject), and a private todo left
        // pointing at a list that no longer exists falls back to the main list
        // in the UI rather than disappearing (see filterTodosForScope).
        reference: { resource: 'project' },
      },
      in_main: {
        type: 'boolean',
        description:
          'When true, the todo also appears on the main list (only meaningful when project is set).',
      },
      category: {
        type: 'string',
        description:
          'Optional grouping within the project list. Empty/missing means uncategorized.',
        reference: { resource: 'category', onDelete: 'set-null' },
      },
    },
  },
  {
    singular: 'list-template',
    plural: LIST_TEMPLATES,
    description:
      'A reusable checklist template. Instantiating one creates a new project pre-filled with its items.',
    user_settable_create: true,
    fields: {
      name: { type: 'string', description: 'Template name.', required: true },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    singular: 'template-item',
    plural: TEMPLATE_ITEMS,
    parents: ['list-template'],
    description: 'A single item within a list template.',
    user_settable_create: true,
    fields: {
      title: { type: 'string', description: 'Item title.', required: true },
      template_category: {
        type: 'string',
        description:
          'Optional grouping within the template. Empty/missing means uncategorized.',
        reference: { resource: 'template-category', onDelete: 'set-null' },
      },
    },
  },
  {
    singular: 'template-category',
    plural: TEMPLATE_CATEGORIES,
    parents: ['list-template'],
    description:
      'A named grouping of items within a list template. Recreated as a project category when the template is instantiated.',
    user_settable_create: true,
    fields: {
      name: { type: 'string', description: 'Category name.', required: true },
      position: {
        type: 'number',
        description: 'Sort order within the template (ascending).',
      },
    },
  },
];
