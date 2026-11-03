/**
 * Sidebar defaults — child of the Superuser app.
 *
 * What a new member's sidebar starts with, edited with the drawer's two
 * lists (`app-drawer/components/SidebarDefaultsHome`). Sidebar placement is
 * owned by the parent (`superuserApp`); the page is superuser-gated.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const sidebarDefaultsApp: AppConfig = {
  id: 'sidebar-defaults',
  name: 'Sidebar defaults',
  description: "What a new member's sidebar starts with",
  web: {
    icon: () => import('lucide-react').then((m) => m.LayoutGrid),
    basePath: '/superuser/sidebar-defaults',
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('../../app-drawer/components/SidebarDefaultsHome').then(
            (m) => m.SidebarDefaultsHome,
          ),
        gates: ['superuser'],
      },
    ],
  },
};
