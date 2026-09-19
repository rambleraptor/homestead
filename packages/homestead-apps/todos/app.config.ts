/**
 * Todos App Configuration
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { todosResources } from './resources';

export const todosApp: AppConfig = {
  id: 'todos',
  name: 'Todos',
  description: 'Daily todo list, with shared and private items.',
  resources: todosResources,
  migrations: [
    {
      id: 'todos-drop-in-progress-status',
      title: 'Move in_progress todos back to pending',
      load: () => import('./migrations/drop-in-progress-status'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.ListTodo),
    basePath: '/todos',
    homeScreenIcon: '/app-icons/todos.png',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/TodosHome').then((m) => m.TodosHome),
      },
      {
        path: 'templates',
        component: () =>
          import('./components/TemplatesHome').then((m) => m.TemplatesHome),
      },
    ],
    showInNav: true,
    navOrder: 5,
    section: 'Tasks',
    widgets: [
      {
        // Cross-app: the day's events, bin night, perks closing, the grocery
        // list, open todos, and the reminders you scheduled for yourself. Lives
        // here rather than in its own app so a single card doesn't cost a
        // registry entry — see `today/hooks/useToday`.
        id: 'todos-today',
        label: 'Today',
        component: () =>
          import('./today/components/TodayWidget').then((m) => m.TodayWidget),
        // Ahead of every other widget: the card is the dashboard's answer to
        // "what now", so it reads first.
        order: 0,
      },
      {
        id: 'todos-active',
        label: 'Active todos',
        component: () => import('./components/TodoWidget').then((m) => m.TodoWidget),
        order: 5,
      },
    ],
  },
};
