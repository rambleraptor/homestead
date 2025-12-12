/**
 * Dashboard Module Configuration
 *
 * This file defines the Dashboard module for HomeOS.
 * It demonstrates the pattern that all modules should follow.
 */

import type { HomeModule } from '../types';
import { LayoutDashboard } from 'lucide-react';
import { dashboardRoutes } from './routes';

export const dashboardModule: HomeModule = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Overview of your HomeOS system',
  icon: LayoutDashboard,
  basePath: '/dashboard',
  routes: dashboardRoutes,
  showInNav: true,
  navOrder: 1, // First item in navigation
  enabled: true,
};
