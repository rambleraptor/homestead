/**
 * Devices App Configuration
 *
 * Household devices (the fridge panel, and whatever comes next) report their
 * own battery into `device-info`. When one runs low, the `devices-low-battery`
 * sync adds a shared "Charge the …" todo and notifies whoever opted in, then
 * checks the todo off once the device is recharged.
 *
 * Depends on the todos app: `device-info.charge_todo` references `todo`, and the
 * boot-time schema sync fails fast if it isn't installed.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { BATTERY_REMINDER_SETTING } from './batteryReminderSetting';
import { devicesResources } from './resources';

export const devicesApp: AppConfig = {
  id: 'devices',
  name: 'Devices',
  description: 'Battery levels of household devices, with a nudge to charge them',
  resources: devicesResources,
  userSettings: {
    // Opt-in per person, like Home's reminders: the todo is household data,
    // but a push is a personal interruption.
    [BATTERY_REMINDER_SETTING]: {
      type: 'boolean',
      label: 'Notify me when a device battery runs low',
      description:
        'Get a notification when a device reports its battery at or below its threshold.',
      default: false,
    },
  },
  // Handler lives under `syncs/`, so it's stubbed out of the browser bundle.
  syncs: [
    {
      id: 'devices-low-battery',
      resource: 'device-info',
      title: 'Low-battery reminder',
      on: ['create', 'update'],
      load: () => import('./syncs/low-battery'),
    },
  ],
  web: {
    icon: () => import('lucide-react').then((m) => m.BatteryMedium),
    basePath: '/devices',
    homeScreenIcon: '/app-icons/devices.png',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/DevicesHome').then((m) => m.DevicesHome),
      },
    ],
    showInNav: true,
    navOrder: 20,
    section: 'Home',
  },
};
