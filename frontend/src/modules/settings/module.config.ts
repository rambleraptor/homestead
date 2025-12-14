/**
 * Settings Module Configuration
 *
 * Module for managing user preferences and notification settings.
 * Enables web push notifications and customization options.
 */

import { Settings } from 'lucide-react';
import type { HomeModule } from '../types';
import { settingsRoutes } from './routes';

export const settingsModule: HomeModule = {
  id: 'settings',
  name: 'Settings',
  description: 'Manage your preferences and notifications',
  icon: Settings,
  basePath: '/settings',
  routes: settingsRoutes,
  showInNav: true,
  navOrder: 100,
  enabled: true,
};
