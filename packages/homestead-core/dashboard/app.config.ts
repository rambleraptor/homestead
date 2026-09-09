/**
 * Dashboard App Configuration
 *
 * Main dashboard app providing an overview of the Homestead system.
 * Renders a first-run welcome guide (see {@link WelcomePanel}) plus the
 * widgets contributed by other apps.
 *
 * The `show_welcome_guide` per-user setting drives the first-login
 * getting-started panel: it defaults to `true`, so brand-new users see
 * the guide, and the panel's dismiss button flips it to `false`. Because
 * it's declared here, it also surfaces as a "Show welcome guide" toggle
 * on the Settings page, letting users bring the guide back.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const dashboardApp: AppConfig = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Overview of your Homestead system',
  userSettings: {
    show_welcome_guide: {
      type: 'boolean',
      label: 'Show welcome guide',
      description: 'Show the getting-started guide on your dashboard.',
      default: true,
    },
  },
  web: {
    icon: () => import('lucide-react').then((m) => m.LayoutDashboard),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/DashboardHome').then((m) => m.DashboardHome),
      },
    ],
    showInNav: false,
    navOrder: 1,
  },
};
