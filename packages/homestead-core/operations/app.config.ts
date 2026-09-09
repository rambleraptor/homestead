/**
 * Operations — child of the Superuser app for viewing AEP-151 long-running
 * operations (async custom methods, cron firings, bulk imports).
 *
 * Sidebar placement is owned by the parent (`superuserApp`); this app surfaces
 * as a card on the Superuser landing page rather than its own nav entry.
 * Defaults to `'superusers'` visibility, and the route applies the explicit
 * `'superuser'` gate so regular users hitting `/superuser/operations` directly
 * are redirected.
 *
 * Gating is UI-only. The `operations` collection itself stays household-shared
 * and ungated: because this app ships in the always-installed Superuser
 * subtree, its collection is excluded from the backend app-access map
 * (`buildAppAccessMap`), so user-initiated async methods (bulk import, receipt
 * parsing) can still create and poll their own operations.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { operationsResources } from './resources';

export const operationsApp: AppConfig = {
  id: 'operations',
  name: 'Operations',
  description: 'View long-running background tasks and their logs.',
  resources: operationsResources,
  crons: [
    {
      // Prune finished operations so the collection stays bounded. Runs once
      // on boot (restarts are common — config edits restart the server) and
      // daily thereafter; the retention window lives in the handler.
      id: 'operations-cleanup',
      title: 'Delete finished operations older than 3 days',
      intervalSeconds: 24 * 60 * 60,
      runOnStart: true,
      load: () => import('./crons/cleanup-operations'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.Activity),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/OperationsHome').then((m) => m.OperationsHome),
        gates: ['superuser'],
      },
    ],
  },
};
