/**
 * Todos Module Configuration
 */

import { ListTodo } from 'lucide-react';
import type { HomeModule } from '@/modules/types';

export const todosModule: HomeModule = {
  id: 'todos',
  name: 'Todos',
  description: 'Daily todo list with progress tracking.',
  icon: ListTodo,
  basePath: '/todos',
  routes: [{ path: '', index: true }],
  showInNav: true,
  navOrder: 5,
  section: 'Tasks',
  enabled: true,
  defaultEnabled: 'all',
};
