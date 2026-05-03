/**
 * Todos Module Configuration
 */

import { ListTodo } from 'lucide-react';
import type { HomeModule } from '@/modules/types';
import { TodosHome } from './components/TodosHome';
import { TodoWidget } from './components/TodoWidget';
import { todosResources } from './resources';

export const todosModule: HomeModule = {
  id: 'todos',
  name: 'Todos',
  description: 'Daily todo list with progress tracking.',
  icon: ListTodo,
  basePath: '/todos',
  routes: [{ path: '', index: true, component: TodosHome }],
  showInNav: true,
  navOrder: 5,
  section: 'Tasks',
  enabled: true,
  defaultEnabled: 'all',
  resources: todosResources,
  widgets: [
    {
      id: 'todos-active',
      component: TodoWidget,
      order: 5,
    },
  ],
};
