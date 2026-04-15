/**
 * Dashboard Module Configuration
 *
 * Main dashboard module providing overview of the HomeOS system.
 * Displays welcome message, statistics, and getting started guide.
 */

import type { HomeModule } from '../types';
import { LayoutDashboard } from 'lucide-react';

export const dashboardModule: HomeModule = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Overview of your HomeOS system',
  icon: LayoutDashboard,
  basePath: '/dashboard',
  routes: [{ path: '', index: true }],
  showInNav: false,
  navOrder: 1,
  enabled: true,
};
