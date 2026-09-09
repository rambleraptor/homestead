/**
 * Flag Management — child of the Superuser app.
 *
 * Sidebar placement is owned by the parent (`superuserApp`); the page itself
 * is gated by this app's own
 * built-in `enabled` flag, defaulting to `'superusers'` to match the
 * parent's audience.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const flagManagementApp: AppConfig = {
  id: 'flag-management',
  name: 'Flag Management',
  description: 'View and edit every app flag registered in aepbase.',
  web: {
    icon: () => import('lucide-react').then((m) => m.Flag),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/FlagManagementHome').then((m) => m.FlagManagementHome),
        gates: ['superuser'],
      },
    ],
  },
};
