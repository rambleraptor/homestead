import { UserCog } from 'lucide-react';
import type { HomeModule } from '../types';

export const usersModule: HomeModule = {
  id: 'users',
  name: 'Users',
  description: 'Create and manage user accounts (superuser only)',
  icon: UserCog,
  basePath: '/users',
  routes: [{ path: '', index: true }],
  section: 'Admin',
  showInNav: true,
  navOrder: 90,
  enabled: true,
  metadata: { requiresSuperuser: true },
};
