/**
 * Devices E2E helpers — seed device reports and read back the todos the
 * low-battery sync raises. `device-info` and `todo` are household-wide, so a
 * regular member's token can write and clean up both.
 */

import { getAepbaseUrl } from '../../../../tests/e2e/config/aepbase.setup';
import { deleteIfPresent, e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

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
