/**
 * `home-pickup-reminders` cron handler.
 *
 * "Which cans go out tomorrow?" is the one household question that has to be
 * answered *the night before* or not at all. The pickup calendar already knows
 * — the hauler sync writes a `garbage-pickup` row per stream per collection day
 * — so this turns the next {@link HORIZON_DAYS} days of that calendar into
 * reminders due at the evening slot the day before each collection, and the
 * evening reminder cron delivers them. One reminder per collection day, listing
 * every stream going out, because that is the thing you act on: not "recycling
 * is collected Tuesday" three times over, but "trash and recycling, tonight".
 *
 * Opt-in per person (`pickup_reminder`, declared in `../app.config.ts`) rather
 * than household-wide: whoever actually wheels the bins out wants this, and
 * nobody else does. The plan is fanned out to one queued notification per
 * opted-in person, so the interruption is theirs alone while the pickup
 * calendar stays what it always was — household data anyone can read. With
 * nobody opted in, no rows are written at all.
 *
 * Idempotent by `source_key` (`pickup:<date>`); see `reconcileScheduled`. That
 * prefix is also the reconcile scope — the Home app's other producer (upkeep
 * reminders) shares this `source_app`, and each must sweep only its own rows.
 *
 * Server-only: lives under `crons/`, so vite stubs it out of the browser bundle.
 */

import type { CronHandler } from '@rambleraptor/homestead-core/apps/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { usersWithFlag } from '@rambleraptor/homestead-core/server/user-settings';
import {
  fanOut,
  reconcileScheduled,
  type PlannedNotification,
} from '@rambleraptor/homestead-core/server/scheduled-notifications';
import { GARBAGE_PICKUPS } from '../resources';
import { PICKUP_REMINDER_SETTING } from '../pickupReminderSetting';
import { parseIsoDate, streamLabel, upcomingPickupDays } from '../utils/pickups';
import type { GarbagePickup } from '../types';

/** The app id stamped on every notification this handler schedules. */
export const HOME_REMINDER_TYPE = 'home';

/**
 * Local hour the night-before reminder goes out. Used to be `EVENING_HOUR`,
 * reached for across packages into the events app because the delivery cron
 * only fired at two fixed hours. The dispatcher runs every minute now, so
 * "tonight" is just 18:00.
 */
export const PICKUP_HOUR = 18;

/** Where tapping a bin reminder lands. */
const HOME_URL = '/home';

/** Namespaces this producer's `source_key`s, and with them its reconcile scope. */
export const PICKUP_KEY_PREFIX = 'pickup:';

/**
 * How far ahead to materialize. A week covers the weekly cadence twice over, so
 * a box that was down for a few days still writes tomorrow's row in time.
 */
export const HORIZON_DAYS = 8;

/** "Trash", "Trash and Recycling", "Trash, Recycling and Compost". */
export function joinStreams(labels: readonly string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** Title + notes for one collection day. */
export function buildContent(
  streams: readonly string[],
  date: string,
): { title: string; notes: string } {
  const labels = joinStreams(streams.map(streamLabel));
  const parsed = parseIsoDate(date);
  const dayStr = parsed
    ? parsed.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : date;
  return {
    title: `Bins out tonight: ${labels}`,
    notes: `${labels} ${streams.length === 1 ? 'is' : 'are'} collected tomorrow, ${dayStr}.`,
  };
}

const handler: CronHandler = async ({ token, firedAt, log }) => {
  const hs = serverClient(token);
  const now = new Date(firedAt);

  const users = await hs.collection<{ id: string }>('users').listAll();
  const optedIn = await usersWithFlag(
    token,
    users.map((user) => user.id),
    HOME_REMINDER_TYPE,
    PICKUP_REMINDER_SETTING,
  );

  const planned: PlannedNotification[] = [];
  let days = 0;

  // With nobody opted in there is nothing to plan — but still reconcile, so
  // turning the setting off withdraws the rows already written for it.
  if (optedIn.length > 0) {
    const pickups = await hs
      .collection<GarbagePickup>(GARBAGE_PICKUPS)
      .listAll();
    const upcoming = upcomingPickupDays(pickups, { days: HORIZON_DAYS, now });
    days = upcoming.length;

    for (const day of upcoming) {
      const collectionDay = parseIsoDate(day.date);
      if (!collectionDay) continue;
      const dueAt = new Date(
        collectionDay.getFullYear(),
        collectionDay.getMonth(),
        collectionDay.getDate() - 1,
        PICKUP_HOUR,
        0,
        0,
        0,
      );
      // The night before today's collection has already been and gone. Skipping
      // it here (rather than leaning on the notify cron's lookback) keeps a
      // first run from announcing a bin night that ended this morning.
      if (dueAt.getTime() <= now.getTime()) continue;

      // De-duped: a hauler sync can write two rows for the same stream on one
      // day (a schedule change re-run), and "Trash and Trash" reads as a bug.
      const streams = [...new Set(day.pickups.map((pickup) => pickup.stream))];
      const { title, notes } = buildContent(streams, day.date);
      const sourceKey = `${PICKUP_KEY_PREFIX}${day.date}`;
      planned.push(
        ...fanOut(
          {
            sourceKey,
            title,
            message: notes,
            url: HOME_URL,
            sendAt: dueAt.toISOString(),
            sourceCollection: GARBAGE_PICKUPS,
          },
          optedIn,
        ),
      );
    }
  }

  const outcome = await reconcileScheduled(token, HOME_REMINDER_TYPE, planned, {
    now,
    // The Home app has a second producer (upkeep reminders) writing under the
    // same `source_app`; without this each run would withdraw the other's rows.
    keyPrefix: PICKUP_KEY_PREFIX,
  });

  await log(
    `optedIn=${optedIn.length} days=${days} planned=${planned.length} created=${outcome.created} updated=${outcome.updated} unchanged=${outcome.unchanged} settled=${outcome.settled} withdrawn=${outcome.withdrawn}`,
  );
  return { optedIn: optedIn.length, days, planned: planned.length, ...outcome };
};

export default handler;
