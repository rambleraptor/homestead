/**
 * Notifications Module Configuration
 *
 * Module for viewing and managing user notifications.
 * Displays event reminders and system notifications.
 */

import { Bell } from 'lucide-react';
import type { HomeModule } from '@/modules/types';
import { NotificationsHome } from './components/NotificationsHome';

export const notificationsModule: HomeModule = {
  id: 'notifications',
  name: 'Notifications',
  description: 'View and manage your notifications',
  icon: Bell,
  basePath: '/notifications',
  routes: [{ path: '', index: true, component: NotificationsHome }],
  showInNav: false,
  navOrder: 4,
  enabled: true,
  omnibox: {
    synonyms: ['notifications', 'reminders', 'alerts', 'inbox'],
    listComponent: NotificationsHome,
  },
};
