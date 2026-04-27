/**
 * Superuser Module Configuration
 *
 * Combines user account management and module-flag administration into
 * a single superuser-only admin surface. The landing page links to the
 * two sub-pages; each sub-page is gated independently in the App Router.
 */

import { ShieldCheck } from 'lucide-react';
import type { HomeModule } from '../types';
import { SuperuserHome } from './components/SuperuserHome';

export const superuserModule: HomeModule = {
  id: 'superuser',
  name: 'Superuser',
  description: 'User accounts and module flags (superuser only)',
  icon: ShieldCheck,
  basePath: '/superuser',
  routes: [
    { path: '', index: true },
    { path: 'users' },
    { path: 'flag-management' },
  ],
  section: 'Settings',
  showInNav: true,
  navOrder: 90,
  enabled: true,
  defaultEnabled: 'superusers',
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
    listComponent: SuperuserHome,
  },
};
