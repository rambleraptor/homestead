/**
 * Dashboard Module Configuration
 *
 * Main dashboard module providing overview of the Homestead system.
 * Displays welcome message, statistics, and getting started guide.
 */

import type { HomeModule } from '@/modules/types';
import { LayoutDashboard } from 'lucide-react';
import { DashboardHome } from './components/DashboardHome';

export const dashboardModule: HomeModule = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Overview of your Homestead system',
  icon: LayoutDashboard,
  basePath: '/dashboard',
  routes: [{ path: '', index: true }],
  showInNav: false,
  navOrder: 1,
  enabled: true,
  omnibox: {
    synonyms: ['dashboard', 'home', 'overview', 'summary'],
    listComponent: DashboardHome,
  },
};
