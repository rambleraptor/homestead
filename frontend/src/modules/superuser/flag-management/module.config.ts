/**
 * Flag Management — child of the Superuser module.
 *
 * Sidebar placement and the omnibox surface are owned by the parent
 * (`superuserModule`); the page itself is gated by this module's own
 * built-in `enabled` flag, defaulting to `'superusers'` to match the
 * parent's audience.
 */

import { Flag } from 'lucide-react';
import type { HomeModule } from '../../types';

export const flagManagementModule: HomeModule = {
  id: 'flag-management',
  name: 'Flag Management',
  description: 'View and edit every module flag registered in aepbase.',
  icon: Flag,
  basePath: '/superuser/flag-management',
  routes: [{ path: '', index: true }],
  enabled: true,
  defaultEnabled: 'superusers',
};
