/**
 * Home app types.
 *
 * `stream`, `status`, and `source` are declared as enums in `resources.ts`, but
 * aepbase strips JSON-schema enums on round-trip — the wire values are plain
 * strings. The types below narrow them for the UI's benefit; treat a value read
 * off the wire as untrusted and fall back gracefully (see `streamLabel`).
 */

import type { GARBAGE_STREAMS, HOME_TASK_INTERVAL_UNITS } from './resources';

export type GarbageStream = (typeof GARBAGE_STREAMS)[number];

export type GarbagePickupStatus = 'scheduled' | 'delayed';

/** Who wrote the row — a household member, or an automated hauler sync. */
export type GarbagePickupSource = 'manual' | 'wm';

export interface GarbagePickup {
  id: string;
  /** ISO `YYYY-MM-DD`, already holiday-adjusted. */
  pickup_date: string;
  stream: GarbageStream;
  status?: GarbagePickupStatus;
  /** ISO `YYYY-MM-DD` the pickup would have fallen on, when delayed. */
  original_date?: string;
  note?: string;
  service_description?: string;
  source?: GarbagePickupSource;
  create_time?: string;
  update_time?: string;
}

export interface GarbagePickupFormData {
  pickup_date: string;
  stream: GarbageStream;
  note?: string;
}

/** How a maintenance interval is counted. */
export type HomeTaskIntervalUnit = (typeof HOME_TASK_INTERVAL_UNITS)[number];

/**
 * A recurring home maintenance task. The record is the schedule, not one
 * occurrence: `next_due` moves forward by one interval each time the task is
 * marked done, and `notes` carries whatever you need in hand to do it.
 */
export interface HomeTask {
  id: string;
  name: string;
  notes?: string;
  interval_count: number;
  interval_unit: HomeTaskIntervalUnit;
  /** ISO `YYYY-MM-DD`. */
  next_due: string;
  /** ISO `YYYY-MM-DD`; unset until it has been done once. */
  last_completed?: string;
  /** Days before `next_due` to send the reminder; 0 is the morning it's due. */
  lead_days?: number;
  /** True to keep the schedule but stop reminding. */
  paused?: boolean;
  create_time?: string;
  update_time?: string;
}

/** Fields the task form collects. */
export interface HomeTaskFormData {
  name: string;
  notes?: string | null;
  interval_count: number;
  interval_unit: HomeTaskIntervalUnit;
  next_due: string;
  lead_days?: number;
}

/** A household device that reports its own battery — mirrors `device-info`. */
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
