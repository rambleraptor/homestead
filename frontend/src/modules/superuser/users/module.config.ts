/**
 * Users — child of the Superuser module.
 *
 * Visibility, sidebar placement, and the omnibox surface are owned
 * by the parent (`superuserModule`). This config exists so the
 * child has a first-class identity (id, icon, basePath) for the
 * parent's auto-generated landing page.
 */

import { UserCog } from 'lucide-react';
import type { HomeModule } from '../../types';

export const usersModule: HomeModule = {
  id: 'users',
  name: 'Users',
  description: 'Create and manage user accounts.',
  icon: UserCog,
  basePath: '/superuser/users',
  routes: [{ path: '', index: true }],
  enabled: true,
};
