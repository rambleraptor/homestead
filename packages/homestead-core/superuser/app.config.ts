/**
 * Superuser — parent app that groups superuser-only admin surfaces.
 *
 * Sub-pages are declared via `children` (full `AppConfig`s living
 * in `./<area>/app.config.ts`); the registry handles route
 * aggregation and validation. Each sub-page is gated independently in
 * the App Router.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { flagManagementApp } from './flag-management/app.config';
import { usersApp } from './users/app.config';
import { homesteadInformationApp } from './homestead-information/app.config';
import { operationsApp } from '@rambleraptor/homestead-core/operations/app.config';
import { permissionsApp } from '@rambleraptor/homestead-core/permissions/app.config';

export const superuserApp: AppConfig = {
  id: 'superuser',
  name: 'Superuser',
  description: 'App flags and other superuser-only controls',
  children: [
    usersApp,
    permissionsApp,
    flagManagementApp,
    operationsApp,
    homesteadInformationApp,
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.ShieldCheck),
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./SuperuserLanding').then((m) => m.SuperuserLanding),
        gates: ['superuser'],
      },
    ],
    section: 'Settings',
    showInNav: true,
    navOrder: 90,
  },
};
