/**
 * Flag Management — child of the Superuser module.
 *
 * Visibility, sidebar placement, and the omnibox surface are owned
 * by the parent (`superuserModule`). This config exists so the
 * child has a first-class identity (id, icon, basePath) for the
 * parent's auto-generated landing page.
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
};
