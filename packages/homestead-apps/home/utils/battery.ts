/**
 * Battery rules shared by the Devices section and the low-battery sync, so the
 * row the Home page paints red is exactly the one the sync raised a todo for.
 */

import type { DeviceInfo } from '../types';

/** Threshold used when a device hasn't set its own `low_threshold`. */
export const DEFAULT_LOW_THRESHOLD = 20;

/**
 * Charge at which a device counts as recharged, re-arming its reminder and
 * closing the todo. Well above the threshold, so a reading that wobbles around
 * it can't raise a fresh todo every wake.
 */
export const RECHARGED_PERCENT = 80;

type BatteryFields = Pick<DeviceInfo, 'battery_percent' | 'charging' | 'low_threshold'>;

/** The reported charge, or `null` when missing or unusable. */
export function batteryOf(device: BatteryFields): number | null {
  const value = device.battery_percent;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function thresholdOf(device: BatteryFields): number {
  const value = device.low_threshold;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_LOW_THRESHOLD;
}

/** At or below its threshold and not already on the charger. */
export function isLow(device: BatteryFields): boolean {
  const battery = batteryOf(device);
  return battery !== null && !device.charging && battery <= thresholdOf(device);
}

/** On the charger, or back up to {@link RECHARGED_PERCENT}. */
export function isRecharged(device: BatteryFields): boolean {
  if (device.charging) return true;
  const battery = batteryOf(device);
  return battery !== null && battery >= Math.max(RECHARGED_PERCENT, thresholdOf(device) + 1);
}

/** "just now", "12 min ago", "3 h ago", "2 days ago" — coarse on purpose. */
export function reportedAgo(reportedAt: string | null | undefined, now: Date = new Date()): string {
  if (!reportedAt) return 'never reported';
  const ms = now.getTime() - new Date(reportedAt).getTime();
  if (Number.isNaN(ms)) return 'never reported';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Threshold choices offered in the Devices section. */
export const THRESHOLD_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50] as const;
