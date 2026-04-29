/**
 * Superuser — parent module that groups Users and Flag Management
 * into a single superuser-only admin surface.
 *
 * Sub-pages are declared via `children` (full `HomeModule`s living
 * in `./<area>/module.config.ts`); the registry handles route
 * aggregation and validation, and the omnibox `listComponent` is a
 * generic `<NestedModuleLanding>` that auto-renders one card per
 * child. Each sub-page is gated independently in the App Router.
 */

import { ShieldCheck } from 'lucide-react';
import type { HomeModule } from '../types';
import { makeNestedModuleLanding } from '@/shared/components/makeNestedModuleLanding';
import { usersModule } from './users/module.config';
import { flagManagementModule } from './flag-management/module.config';

export const superuserModule: HomeModule = {
  id: 'superuser',
  name: 'Superuser',
  description: 'User accounts and module flags (superuser only)',
  icon: ShieldCheck,
  basePath: '/superuser',
  routes: [{ path: '', index: true }],
  section: 'Settings',
  showInNav: true,
  navOrder: 90,
  enabled: true,
  defaultEnabled: 'superusers',
  children: [usersModule, flagManagementModule],
  omnibox: {
    synonyms: [
      'superuser',
      'admin',
      'users',
      'accounts',
      'members',
      'flags',
      'flag management',
    ],
    listComponent: makeNestedModuleLanding(() => superuserModule),
  },
};
