import { UserCog } from 'lucide-react';
import type { HomeModule } from '../types';
import { UsersHome } from './components/UsersHome';

export const usersModule: HomeModule = {
  id: 'users',
  name: 'Users',
  description: 'Create and manage user accounts (superuser only)',
  icon: UserCog,
  basePath: '/users',
  routes: [{ path: '', index: true }],
  section: 'Settings',
  showInNav: true,
  navOrder: 90,
  enabled: true,
  defaultEnabled: 'superusers',
  omnibox: {
    synonyms: ['users', 'accounts', 'members', 'admin'],
    listComponent: UsersHome,
  },
};
