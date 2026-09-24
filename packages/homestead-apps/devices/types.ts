/**
 * Devices app types — mirrors `device-info` in `resources.ts`.
 */

export interface DeviceInfo {
  id: string;
  path?: string;
  name: string;
  battery_percent?: number | null;
  charging?: boolean | null;
  low_threshold?: number | null;
  firmware?: string | null;
  /** RFC3339. */
  reported_at?: string | null;
  low_battery_alerted?: boolean | null;
  /** Id of the open "charge this" todo, if any. */
  charge_todo?: string | null;
  create_time?: string;
  update_time?: string;
}
