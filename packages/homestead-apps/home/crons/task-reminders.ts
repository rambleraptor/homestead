/**
 * `home-task-reminders` cron handler.
 *
 * The upkeep list knows what the house needs and when — this turns the next
 * {@link HORIZON_DAYS} days of it into queued notifications, and the
 * dispatcher delivers them. One notification per task per due date, sent the
 * morning of the reminder (`next_due` minus the task's own `lead_days`, so
 * "book the gutter people two weeks out" and "change the filter today" can
 * live on the same list).
 *
 * The notification carries the task's `notes` verbatim. That is the whole point
 * of the field: the reminder arrives while you're standing at the hardware
 * store, and "20x25x1, MERV 11" in the body beats a link you have to open.
 *
 * Opt-in per person (`task_reminder`, declared in `../app.config.ts`), like bin
 * night: the schedule is household data anyone can edit, but an interruption
 * belongs to whoever asked for it. The plan is fanned out to one queued
 * notification per opted-in person; with nobody opted in, no rows are written.
 *
 * **Overdue tasks are chased once a day.** A task whose date has passed is
 * still the thing you meant to do, so its reminder moves to the next morning
 * slot ahead rather than being written into the past, where the dispatcher
 * could only mark it missed — and because the source key carries the chase
 * date, each day's nudge is its own row rather than a rewrite of the one that
 * already went out. That's deliberate: an unattended gutter should keep asking.
 *
 * Idempotent by `source_key` (`task:<id>:<due date>[:<chase date>]`); see
 * `reconcileScheduled`.
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
import { HOME_TASKS } from '../resources';
import { TASK_REMINDER_SETTING } from '../taskReminderSetting';
import { daysBetween, parseIsoDate } from '../utils/pickups';
import { intervalLabel, toIsoDate } from '../utils/homeTasks';
import type { HomeTask } from '../types';

/** The app id stamped on every notification this handler schedules. */
export const HOME_REMINDER_TYPE = 'home';

/** Local hour an upkeep reminder is delivered at — the start of the day it's for. */
export const TASK_HOUR = 9;

/** Where tapping an upkeep reminder lands. */
const HOME_URL = '/home';

/**
 * Namespaces this producer's `source_key`s, and with them its reconcile scope.
 * The bin-night cron shares this `source_app`, so each must sweep only its own.
 */
export const TASK_KEY_PREFIX = 'task:';

/**
 * How far ahead to materialize, measured on the *reminder* instant rather than
 * the due date — a task asking for 30 days' notice is planned when its reminder
 * comes within the window, not when the job does. Two weeks gives a daily run
 * plenty of slack for a box that was down for a few days.
 */
export const HORIZON_DAYS = 14;

/** Longest lead a stored row is trusted to ask for; guards a bad hand-edit. */
const MAX_LEAD_DAYS = 90;

/**
 * The notification for one due task: the name in the title, the cadence and
 * whatever the notes say in the body — everything you need without opening the
 * app.
 */
export function buildContent(
  task: HomeTask,
  dueDate: Date,
  daysEarly: number,
): { title: string; message: string } {
  const dayStr = dueDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  // No trailing punctuation: the parts are joined with a separator below, and
  // "September 7. · Every 3 months" reads like a typo.
  const when =
    daysEarly > 0
      ? `Due ${dayStr} — ${daysEarly} day${daysEarly === 1 ? '' : 's'} from now`
      : daysEarly < 0
        ? `Was due ${dayStr}`
        : `Due today, ${dayStr}`;
  const cadence = intervalLabel(task.interval_count, task.interval_unit);
  const notes = task.notes?.trim();
  return {
    title: daysEarly < 0 ? `Overdue: ${task.name}` : `Home upkeep: ${task.name}`,
    message: [when, cadence, notes].filter(Boolean).join(' · '),
  };
}

/** Local `Date` at {@link TASK_HOUR} on the calendar day `date` falls on. */
function morningOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), TASK_HOUR, 0, 0, 0);
}

/** The next {@link TASK_HOUR} slot strictly after `now` — today's, else tomorrow's. */
export function nextMorningAfter(now: Date): Date {
  const todaySlot = morningOf(now);
  if (todaySlot.getTime() > now.getTime()) return todaySlot;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, TASK_HOUR, 0, 0, 0);
}

/** A task's lead time, clamped to something sane whatever the row says. */
export function leadDaysOf(task: HomeTask): number {
  const lead = Number(task.lead_days ?? 0);
  if (!Number.isFinite(lead) || lead <= 0) return 0;
  return Math.min(Math.floor(lead), MAX_LEAD_DAYS);
}

const handler: CronHandler = async ({ token, firedAt, log }) => {
  const hs = serverClient(token);
  const now = new Date(firedAt);
  const horizonEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + HORIZON_DAYS,
    23,
    59,
    59,
    999,
  ).getTime();

  const users = await hs.collection<{ id: string }>('users').listAll();
  const optedIn = await usersWithFlag(
    token,
    users.map((user) => user.id),
    HOME_REMINDER_TYPE,
    TASK_REMINDER_SETTING,
  );

  const planned: PlannedNotification[] = [];
  let considered = 0;

  // With nobody opted in there is nothing to plan — but still reconcile, so
  // turning the setting off withdraws the rows already written for it.
  if (optedIn.length > 0) {
    const tasks = await hs.collection<HomeTask>(HOME_TASKS).listAll();

    for (const task of tasks) {
      if (task.paused) continue;
      const dueDate = parseIsoDate(task.next_due ?? '');
      if (!dueDate) continue;
      considered++;

      const lead = leadDaysOf(task);
      const remindAt = morningOf(
        new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate() - lead),
      );
      // The moment this task wanted has already gone — either it's overdue, or
      // this run started after today's slot (a boot catch-up). Either way the
      // nudge moves to the next slot ahead rather than being written into the
      // past, where the dispatcher could only ever mark it missed. The chase
      // date joins the key, so each day's nudge is its own row rather than a
      // rewrite of the one that already went out.
      const late = remindAt.getTime() <= now.getTime();
      const dueAt = late ? nextMorningAfter(now) : remindAt;
      if (dueAt.getTime() > horizonEnd) continue;

      // Written from the perspective of the moment it lands, not of this run:
      // a row queued today for Thursday reads "Due today" when it arrives.
      const daysEarly = daysBetween(toIsoDate(dueAt), task.next_due) ?? 0;
      const { title, message } = buildContent(task, dueDate, daysEarly);
      const sourceKey = late
        ? `${TASK_KEY_PREFIX}${task.id}:${task.next_due}:${toIsoDate(dueAt)}`
        : `${TASK_KEY_PREFIX}${task.id}:${task.next_due}`;

      planned.push(
        ...fanOut(
          {
            sourceKey,
            title,
            message,
            url: HOME_URL,
            sendAt: dueAt.toISOString(),
            sourceCollection: HOME_TASKS,
            sourceId: task.id,
          },
          optedIn,
        ),
      );
    }
  }

  const outcome = await reconcileScheduled(token, HOME_REMINDER_TYPE, planned, {
    now,
    // Scoped so this run never touches the bin-night rows sharing `source_app`.
    keyPrefix: TASK_KEY_PREFIX,
  });

  await log(
    `optedIn=${optedIn.length} tasks=${considered} planned=${planned.length} created=${outcome.created} updated=${outcome.updated} unchanged=${outcome.unchanged} settled=${outcome.settled} withdrawn=${outcome.withdrawn}`,
  );
  return { optedIn: optedIn.length, tasks: considered, planned: planned.length, ...outcome };
};

export default handler;
