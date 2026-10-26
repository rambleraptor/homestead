/**
 * Dashboard App Configuration
 *
 * The home: the assistant's conversation, with a strip of chips for the
 * widgets other apps contribute (see `components/agentic/AgenticHome`). The
 * conversation needs an AI provider and access to Chat; without them the home
 * keeps its chips and says why the assistant isn't there.
 *
 * The `classic_home` flag gives its audience the classic dashboard instead —
 * the widget stack with an Ask box (see `components/ClassicHome`) — so a group
 * can keep it while everyone else has the assistant's home.
 *
 * The `show_welcome_guide` per-user setting dismisses the getting-started
 * panel: the admin setup checklist, or a member's welcome guide on the
 * classic dashboard.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const dashboardApp: AppConfig = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Your home: the assistant, and what needs you today',
  flags: {
    classic_home: {
      type: 'boolean',
      label: 'Classic dashboard',
      description:
        'Show the classic dashboard — the stack of widgets, with an Ask box into the ' +
        'assistant — in place of the assistant\'s home. Limit its audience to the ' +
        'groups that should keep it.',
      default: false,
    },
  },
  // The assistant-first home was tried behind the `agentic_home` flag, then
  // made the default. This authorizes dropping that flag's stored columns.
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
    show_welcome_guide: {
      type: 'boolean',
      label: 'Show welcome guide',
      description: 'Show the getting-started guide (for admins, the setup checklist) on the home.',
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
        // A conversation, on either home.
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
