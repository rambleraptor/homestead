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
  flags: {
    // Edited from Superuser → Sidebar defaults, not by hand: a JSON object of
    // app id → whether it starts in the sidebar, holding only the exceptions
    // to each app's own `web.pinnedByDefault`. A person's own choices still
    // win. Read by `useSidebarPins`.
    sidebar_defaults: {
      type: 'string',
      label: 'Sidebar defaults',
      description:
        'Which apps start out in everyone\'s sidebar, as a JSON object of app id to ' +
        'true/false. Apps not listed follow their own config. Edit it from Superuser → ' +
        'Sidebar defaults rather than here. Each person can still change their own sidebar.',
      default: '',
    },
  },
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
