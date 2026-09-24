/**
 * Data access for `device-info`.
 *
 * Devices create and report into their own records, so the Home page only ever
 * reads, tunes a threshold, or forgets a device.
 */

import {
  useResourceDelete,
  useResourceList,
  useResourceUpdate,
} from '@rambleraptor/homestead-core/api/resourceHooks';
import { DEVICE_INFOS } from '../resources';
import type { DeviceInfo } from '../types';

export function useDevices() {
  return useResourceList<DeviceInfo>('home', 'device-info', DEVICE_INFOS, {
    sort: (a, b) => a.name.localeCompare(b.name),
  });
}

/** Variables are `{ id, data }`; send a field as `null` to clear it (merge-patch). */
export function useUpdateDevice() {
  return useResourceUpdate<DeviceInfo>('home', 'device-info');
}

export function useDeleteDevice() {
  return useResourceDelete('home', 'device-info');
}
