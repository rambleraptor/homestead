/**
 * Users — child of the Superuser app for managing user accounts.
 *
 * Sidebar placement is owned by the parent (`superuserApp`); this app
 * surfaces as a card on the Superuser landing page rather than its own
 * nav entry. Defaults to `'superusers'` visibility, and the route applies
 * the explicit `'superuser'` gate so regular users hitting
 * `/superuser/users` directly are redirected.
 *
 * The underlying `user` collection is owned by aepbase via
 * `EnableUsers = true`; this app deliberately does not declare a
 * `user` `ResourceDefinition`, and no longer declares any resources of
 * its own (account-tags were retired in favor of permission groups).
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const usersApp: AppConfig = {
  id: 'users',
  name: 'Users',
  description: 'Create and manage user accounts.',
  web: {
    icon: () => import('lucide-react').then((m) => m.UserCog),
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/UsersHome').then((m) => m.UsersHome),
        gates: ['superuser'],
      },
    ],
  },
};
