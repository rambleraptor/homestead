/**
 * `calendar-reminders-on-write` sync handler.
 *
 * The daily cron plans reminders a couple of days ahead, which is no use for
 * the dentist appointment someone adds this morning for this afternoon — or
 * moves, or cancels. So every write to an event re-plans straight away, with
 * the same code (`../crons/plan`). The plan is a reconcile of the whole
 * near-term calendar rather than a reaction to the one record, so delivery
 * being at-least-once and out of order costs nothing: any run leaves the queue
 * matching the calendar as it stands.
 *
 * Server-only: lives under `syncs/`, so vite stubs it out of the browser bundle.
 */

import type { SyncHandler } from '@rambleraptor/homestead-core/apps/types';
import { planCalendarReminders } from '../crons/plan';

const handler: SyncHandler = async ({ token, log }) => {
  const outcome = await planCalendarReminders(token, new Date());
  await log(
    `planned=${outcome.planned} created=${outcome.created} updated=${outcome.updated} withdrawn=${outcome.withdrawn}`,
  );
  return { ...outcome };
};

export default handler;
