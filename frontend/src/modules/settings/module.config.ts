/**
 * Settings Module Configuration
 *
 * Module for managing user preferences and notification settings.
 * Enables web push notifications and customization options.
 */

import { Settings } from 'lucide-react';
import type { HomeModule } from '../types';
import { SettingsHome } from './components/SettingsHome';

export const settingsModule: HomeModule = {
  id: 'settings',
  name: 'Settings',
  description: 'Manage your preferences and notifications',
  icon: Settings,
  basePath: '/settings',
  routes: [{ path: '', index: true }],
  section: 'Settings',
  showInNav: true,
  navOrder: 100,
  enabled: true,
  omnibox: {
    synonyms: ['settings', 'preferences', 'config', 'options'],
    listComponent: SettingsHome,
  },
};
