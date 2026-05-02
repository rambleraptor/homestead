/**
 * Settings Module Configuration
 *
 * Module for managing user preferences and notification settings.
 * Enables web push notifications and customization options.
 */

import { Settings } from 'lucide-react';
import type { HomeModule } from '@/modules/types';
import { SettingsHome } from './components/SettingsHome';

export const OMNIBOX_ACCESS_OPTIONS = ['superuser', 'all'] as const;
export type OmniboxAccess = (typeof OMNIBOX_ACCESS_OPTIONS)[number];

export const settingsModule: HomeModule = {
  id: 'settings',
  name: 'Settings',
  description: 'Manage your preferences and notifications',
  icon: Settings,
  basePath: '/settings',
  routes: [{ path: '', index: true, component: SettingsHome }],
  section: 'Settings',
  showInNav: true,
  navOrder: 100,
  enabled: true,
  omnibox: {
    synonyms: ['settings', 'preferences', 'config', 'options'],
    listComponent: SettingsHome,
  },
  flags: {
    omnibox_access: {
      type: 'enum',
      label: 'Omnibox access',
      description:
        'Who can use the natural-language omnibox (⌘K / search bar).',
      options: OMNIBOX_ACCESS_OPTIONS,
      default: 'superuser',
    },
  },
};
