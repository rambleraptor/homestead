/**
 * Home E2E helpers — seed and clear the household's upkeep schedule and device
 * reports via the aepbase REST API. `home-task`, `device-info`, and `todo` are
 * flat, household-wide collections, so a regular member's token can both write
 * and clean up.
 */

import { getAepbaseUrl } from '../../../../tests/e2e/config/aepbase.setup';
import { deleteIfPresent, e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

export interface HomeTaskRecord {
  id: string;
  name: string;
  notes?: string;
  interval_count: number;
  interval_unit: 'day' | 'week' | 'month' | 'year';
  next_due: string;
  last_completed?: string;
  lead_days?: number;
  paused?: boolean;
}

export type HomeTaskSeed = Omit<HomeTaskRecord, 'id'>;

/** ISO `YYYY-MM-DD` `days` from today, so seeds don't rot as the calendar moves. */
export function isoDaysFromToday(days: number): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const testHomeTasks: HomeTaskSeed[] = [
  {
    name: 'Replace furnace filter',
    notes: '20x25x1, MERV 11 — spares are on the shelf by the water heater',
    interval_count: 3,
    interval_unit: 'month',
    next_due: isoDaysFromToday(5),
  },
  {
    name: 'Clean gutters',
    interval_count: 6,
    interval_unit: 'month',
    next_due: isoDaysFromToday(-3),
    lead_days: 7,
  },
];

function tasks(token: string) {
  return e2eClient(token).collection<HomeTaskRecord>('home-tasks');
}

export async function createHomeTask(
  token: string,
  data: HomeTaskSeed,
): Promise<HomeTaskRecord> {
  return tasks(token).create(data);
}

export async function listHomeTasks(token: string): Promise<HomeTaskRecord[]> {
  return tasks(token).listAll();
}

export async function getHomeTask(token: string, id: string): Promise<HomeTaskRecord> {
  return tasks(token).get(id);
}

/** The collection is household-wide, so this clears every task on the instance. */
export async function deleteAllHomeTasks(token: string) {
  for (const task of await listHomeTasks(token)) {
    await deleteIfPresent(token, 'home-tasks', task.id);
  }
}

// --- Devices ---------------------------------------------------------------

export interface DeviceRecord {
  id: string;
  name: string;
  battery_percent?: number;
  charging?: boolean;
  low_threshold?: number;
  reported_at?: string;
  low_battery_alerted?: boolean;
  charge_todo?: string | null;
}

interface TodoRecord {
  id: string;
  title: string;
  status: string;
}

function devices(token: string) {
  return e2eClient(token).collection<DeviceRecord>('device-infos');
}

/**
 * Create a device under a caller-chosen id, the way a real device registers
 * (`POST /device-infos?id=<id>`). The shared client has no create-with-id, so
 * this one call goes over plain fetch.
 */
export async function createDevice(
  token: string,
  id: string,
  data: Omit<DeviceRecord, 'id'>,
): Promise<DeviceRecord> {
  const res = await fetch(`${getAepbaseUrl()}/device-infos?id=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ reported_at: new Date().toISOString(), ...data }),
  });
  if (!res.ok) throw new Error(`create device ${id}: ${res.status} ${await res.text()}`);
  return (await res.json()) as DeviceRecord;
}

/** A follow-up report: what a device PATCHes on each check-in. */
export async function reportDevice(
  token: string,
  id: string,
  patch: Partial<Omit<DeviceRecord, 'id'>>,
): Promise<DeviceRecord> {
  return devices(token)
    .record(id)
    .update({ reported_at: new Date().toISOString(), ...patch });
}

export async function getDevice(token: string, id: string): Promise<DeviceRecord> {
  return devices(token).get(id);
}

/** The "Charge the …" todos the sync raised. */
export async function listChargeTodos(token: string): Promise<TodoRecord[]> {
  const todos = await e2eClient(token).collection<TodoRecord>('todos').listAll();
  return todos.filter((todo) => todo.title.startsWith('Charge the '));
}

/** Clears every device and every charge todo on the instance. */
export async function deleteAllDevices(token: string) {
  for (const device of await devices(token).listAll()) {
    await deleteIfPresent(token, 'device-infos', device.id);
  }
  for (const todo of await listChargeTodos(token)) {
    await deleteIfPresent(token, 'todos', todo.id);
  }
}
