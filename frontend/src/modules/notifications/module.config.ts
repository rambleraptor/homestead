/**
 * Notifications Module Configuration
 *
 * Module for viewing and managing user notifications.
 * Displays event reminders and system notifications.
 */

import { Bell } from 'lucide-react';
import type { HomeModule } from '../types';
import { notificationRoutes } from './routes';

export const notificationsModule: HomeModule = {
  id: 'notifications',
  name: 'Notifications',
  description: 'View and manage your notifications',
  icon: Bell,
  basePath: '/notifications',
  routes: notificationRoutes,
  showInNav: true,
  navOrder: 4,
  enabled: true,
};
