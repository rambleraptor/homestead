import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

/** Plural URL segment for `device-info`. */
export const DEVICE_INFOS = 'device-infos' as const;

export const devicesResources: ResourceDefinition[] = [
  {
    singular: 'device-info',
    plural: DEVICE_INFOS,
    description:
      'A household device that reports its own state (e.g. the fridge panel). ' +
      'Devices write this themselves; pick a stable id on create (`?id=fridge-panel`) ' +
      'and PATCH it on every report.',
    user_settable_create: true,
    fields: {
      name: { type: 'string', description: 'Display name, e.g. "Fridge panel".', required: true },
      battery_percent: {
        type: 'number',
        description: 'Last reported charge, 0–100. Missing when the device could not read it.',
        minimum: 0,
        maximum: 100,
      },
      charging: {
        type: 'boolean',
        description: 'True while the device reports it is on external power.',
      },
      low_threshold: {
        type: 'number',
        description:
          'Charge (percent) at or below which a "charge this" todo is raised. Defaults to 20 when unset.',
        minimum: 1,
        maximum: 90,
      },
      firmware: { type: 'string', description: 'Firmware or software version the device runs.' },
      reported_at: {
        type: 'string',
        format: 'date-time',
        description: 'RFC3339 time of the device’s last report.',
      },
      low_battery_alerted: {
        type: 'boolean',
        description:
          'Set by Homestead once a low-battery reminder has gone out; cleared when the device is recharged. Devices should not write it.',
      },
      charge_todo: {
        type: 'string',
        description: 'The open "charge this device" todo, if any. Managed by Homestead.',
        reference: { resource: 'todo', onDelete: 'set-null' },
      },
    },
  },
];
