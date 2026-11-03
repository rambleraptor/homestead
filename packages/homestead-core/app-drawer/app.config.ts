/**
 * App Drawer Configuration
 *
 * Core app (always installed): the page at `/apps` that lists every app the
 * signed-in person can use, pinned to their sidebar or not. The sidebar's
 * fixed "All apps" entry opens it. It owns no data and exposes nothing the
 * permission system doesn't already let the viewer see, so it is in
 * `ALWAYS_VISIBLE_APPS` next to Settings: even a Guest with no apps can open
 * it and read that nothing has been shared with them.
 */

import type { AppConfig } from '../apps/types';

export const appDrawerApp: AppConfig = {
  id: 'apps',
  name: 'All apps',
  description: 'Everything you can use here',
  web: {
    icon: () => import('lucide-react').then((m) => m.LayoutGrid),
    basePath: '/apps',
    homeScreenIcon: '/app-icons/apps.png',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/AppDrawerHome').then((m) => m.AppDrawerHome),
      },
    ],
    // The sidebar links to it from a fixed entry, not as an app.
    showInNav: false,
  },
};
