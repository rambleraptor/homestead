/**
 * `devices-low-battery` sync handler.
 *
 * Fires after every write to a `device-info` record — in practice, each time a
 * device reports its battery. When the charge drops to the device's threshold it
 * raises a shared "Charge the <device>" todo and queues a notification for
 * everyone who opted in (`battery_reminder`); when the device is back on the
 * charger or up to {@link RECHARGED_PERCENT}, it checks the todo off and
 * re-arms.
 *
 * **One reminder per discharge.** `low_battery_alerted` on the device record is
 * the latch: set when the reminder goes out, cleared only on recharge. So a
 * panel that keeps reporting 18% every fifteen minutes doesn't raise a todo per
 * wake, and deleting the todo dismisses it rather than summoning a fresh one on
 * the next report. The gap between the threshold and the recharge level keeps a
 * reading that wobbles around the threshold from flapping.
 *
 * **Idempotent.** The handler's own PATCH of the device fires this sync again,
 * and delivery is at-least-once, so every decision is made against the record
 * as it stands *now* (re-read, not the event snapshot): a re-run finds the latch
 * already set, or already cleared, and does nothing.
 *
 * Server-only: lives under `syncs/`, so vite stubs it out of the browser bundle.
 */

import type { SyncHandler } from '@rambleraptor/homestead-core/apps/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { usersWithFlag } from '@rambleraptor/homestead-core/server/user-settings';
import {
  fanOut,
  scheduleNotification,
} from '@rambleraptor/homestead-core/server/scheduled-notifications';
import { BATTERY_REMINDER_SETTING } from '../batteryReminderSetting';
import { DEVICE_INFOS } from '../resources';
import type { DeviceInfo } from '../types';
import { batteryOf, isLow, isRecharged } from '../utils/battery';

/** The app id stamped on every notification this handler queues. */
export const DEVICES_APP_ID = 'devices';

/** Shared todos collection (owned by the todos app). */
const TODOS = 'todos';

/** Where tapping the notification lands. */
const TODOS_URL = '/todos';

interface TodoRecord {
  id: string;
  status: string;
}

export function todoTitle(device: DeviceInfo): string {
  return `Charge the ${device.name}`;
}

export function notificationContent(device: DeviceInfo): { title: string; message: string } {
  const battery = batteryOf(device);
  return {
    title: `${device.name} battery low`,
    message:
      battery === null
        ? `Charge the ${device.name}.`
        : `${device.name} is at ${Math.round(battery)}% — time to charge it.`,
  };
}

const handler: SyncHandler = async ({ token, recordId, event, log }) => {
  if (event === 'delete') return { action: 'none' };

  const hs = serverClient(token);
  const devices = hs.collection<DeviceInfo>(DEVICE_INFOS);
  const device = await devices.record(recordId).get();

  if (isLow(device) && !device.low_battery_alerted) {
    const todo = await hs.collection<TodoRecord>(TODOS).create({
      title: todoTitle(device),
      status: 'pending',
    });
    // Latch before notifying: if the fan-out fails and the dispatcher retries,
    // the re-run sees the latch and doesn't raise a second todo.
    await devices.record(recordId).update({ low_battery_alerted: true, charge_todo: todo.id });

    const users = await hs.collection<{ id: string }>('users').listAll();
    const optedIn = await usersWithFlag(
      token,
      users.map((user) => user.id),
      DEVICES_APP_ID,
      BATTERY_REMINDER_SETTING,
    );
    const { title, message } = notificationContent(device);
    const planned = fanOut(
      {
        title,
        message,
        url: TODOS_URL,
        sendAt: new Date().toISOString(),
        sourceCollection: DEVICE_INFOS,
        sourceId: device.id,
      },
      optedIn,
    );
    for (const plan of planned) {
      await scheduleNotification(token, plan, DEVICES_APP_ID);
    }

    await log(`low: todo=${todo.id} notified=${planned.length}`);
    return { action: 'alerted', todo: todo.id, notified: planned.length };
  }

  if (isRecharged(device) && (device.low_battery_alerted || device.charge_todo)) {
    let closed = false;
    if (device.charge_todo) {
      const todos = hs.collection<TodoRecord>(TODOS);
      // A todo someone already finished, cancelled, or deleted is left alone.
      const todo = await todos.get(device.charge_todo).catch(() => null);
      if (todo && (todo.status === 'pending' || todo.status === 'do_later')) {
        await todos.record(todo.id).update({ status: 'completed' });
        closed = true;
      }
    }
    await devices.record(recordId).update({ low_battery_alerted: false, charge_todo: null });

    await log(`recharged: closedTodo=${closed}`);
    return { action: 'rearmed', closedTodo: closed };
  }

  return { action: 'none' };
};

export default handler;
