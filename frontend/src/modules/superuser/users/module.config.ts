/**
 * Users — child of the Superuser module.
 *
 * Sidebar placement and the omnibox surface are owned by the parent
 * (`superuserModule`); the page itself is gated by this module's own
 * built-in `enabled` flag, defaulting to `'superusers'` to match the
 * parent's audience.
 */

import { UserCog } from 'lucide-react';
import type { HomeModule } from '../../types';
import { UsersHome } from './components/UsersHome';

export const usersModule: HomeModule = {
  id: 'users',
  name: 'Users',
  description: 'Create and manage user accounts.',
  icon: UserCog,
  basePath: '/superuser/users',
  routes: [
    { path: '', index: true, component: UsersHome, gates: ['enabled'] },
  ],
  enabled: true,
  defaultEnabled: 'superusers',
};
