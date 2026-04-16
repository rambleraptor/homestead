/**
 * Flag Management Module Configuration
 *
 * Superuser-only admin surface for viewing every declared module flag
 * and editing its value. Flags themselves are declared in each module's
 * `module.config.ts`; this module simply reads the aggregated registry.
 */

import { Flag } from 'lucide-react';
import type { HomeModule } from '../types';

export const flagManagementModule: HomeModule = {
  id: 'flag-management',
  name: 'Flag Management',
  description: 'View and edit module flags (superuser only)',
  icon: Flag,
  basePath: '/flag-management',
  routes: [{ path: '', index: true }],
  section: 'Settings',
  showInNav: true,
  navOrder: 95,
  enabled: true,
  metadata: { requiresSuperuser: true },
};
