/**
 * Dashboard App Configuration
 *
 * The home: the assistant's conversation, with a strip of chips for the
 * widgets other apps contribute (see `components/agentic/AgenticHome`). The
 * conversation needs an AI provider and access to Chat; without them the home
 * keeps its chips and says why the assistant isn't there.
 *
 * The `show_welcome_guide` per-user setting dismisses the admin setup
 * checklist shown on the home (the key predates the checklist).
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const dashboardApp: AppConfig = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Your home: the assistant, and what needs you today',
  // The assistant-first home was tried behind a flag; it is now the only
  // home. This authorizes dropping the flag's stored columns.
  migrations: [
    {
      id: 'dashboard-drop-agentic-home-flag',
      title: 'Retire the agentic-home flag',
      drops: [
        { resource: 'app-flag', field: 'dashboard__agentic_home' },
        { resource: 'app-flag', field: 'dashboard__agentic_home__audience' },
      ],
      load: () => import('./migrations/drop-agentic-home-flag'),
    },
  ],
  userSettings: {
    // Key kept from the retired welcome guide (renaming it would drop a
    // column that holds data); it now dismisses the admin setup checklist.
    show_welcome_guide: {
      type: 'boolean',
      label: 'Show setup checklist',
      description: 'For admins: show the setup checklist on the home.',
      default: true,
    },
  },
  web: {
    icon: () => import('lucide-react').then((m) => m.LayoutDashboard),
    basePath: '/dashboard',
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/DashboardHome').then((m) => m.DashboardHome),
      },
      {
        // A conversation on the agentic home; the classic home sends it to Chat.
        path: 'c/:id',
        component: () =>
          import('./components/DashboardHome').then((m) => m.DashboardHome),
        dynamic: true,
      },
    ],
    showInNav: false,
    navOrder: 1,
  },
};
