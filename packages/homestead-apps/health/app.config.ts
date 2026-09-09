/**
 * Health App Configuration
 *
 * Personal health records, starting with vaccinations. All health data is
 * private per user — see the `access` declaration in `resources.ts`.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { healthResources } from './resources';

export const healthApp: AppConfig = {
  id: 'health',
  name: 'Health',
  description: 'Track your personal vaccination records — private to you',
  resources: healthResources,
  web: {
    icon: () => import('lucide-react').then((m) => m.HeartPulse),
    // The one app that overrides its derived path: `/health` (from the id) is
    // server-owned — the readiness probe, see SERVER_OWNED_SEGMENTS in
    // homestead-core/apps/paths.ts — and never reaches the SPA.
    basePath: '/health-records',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/HealthHome').then((m) => m.HealthHome),
      },
    ],
    showInNav: true,
    navOrder: 10,
    section: 'Health',
  },
};
