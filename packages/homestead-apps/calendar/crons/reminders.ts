/**
 * `calendar-reminders` cron handler: the daily pass that queues reminders for
 * the events coming up. The planning itself is in `./plan`, shared with the
 * handler that re-plans whenever an event is written.
 *
 * Server-only: lives under `crons/`, so vite stubs it out of the browser bundle.
 */

import type { CronHandler } from '@rambleraptor/homestead-core/apps/types';
import { planCalendarReminders } from './plan';

const handler: CronHandler = async ({ token, firedAt, log }) => {
  const outcome = await planCalendarReminders(token, new Date(firedAt));
  await log(
    `calendars=${outcome.calendars} planned=${outcome.planned} created=${outcome.created} updated=${outcome.updated} unchanged=${outcome.unchanged} settled=${outcome.settled} withdrawn=${outcome.withdrawn}`,
  );
  return { ...outcome };
};

export default handler;
