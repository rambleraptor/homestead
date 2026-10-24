/**
 * Scheduling notifications for a future instant.
 *
 * This is the producer side of the delivery queue. Nothing here sends anything
 * — it writes rows under `/users/{id}/scheduled-notifications`, and the
 * dispatcher cron (`notifications/crons/dispatch.ts`) delivers whatever has
 * come due. One place decides *what* to say and when; one place decides *how*
 * to say it.
 *
 * Two kinds of caller:
 *
 * - **Ad-hoc**, via {@link scheduleNotification}: something happened, tell this
 *   person about it later. Fire and forget.
 * - **Reconciling**, via {@link reconcileScheduled}: an app owns records that
 *   imply notifications (an event a week out, tomorrow's bin night, a perk
 *   window closing) and re-derives the whole set on a daily cron. Because that
 *   cron runs over an overlapping horizon, it can't create blindly — it hands
 *   over the full plan and this module makes the stored rows match.
 *
 * The reconciling contract is a `source_key` per planned notification: an
 * app-unique, stable string identifying *what the notification is for*
 * (`<event id>:day_of:2026`, `pickup:2026-08-25`). It must be derived from the
 * source record, never from the clock — it is the only thing standing between
 * one notification and seven copies of it.
 *
 * Server-only. Runs under the short-lived admin token a cron or migration is
 * given, which is what lets it write into another user's subtree
 * (`checkUserScope` denies that to everyone else).
 */

import { serverClient } from './client';
import { SCHEDULED_NOTIFICATIONS } from '../notifications/constants';
import type { ScheduledNotification } from '../notifications/types';

/** A notification a caller wants delivered to one person at one instant. */
export interface PlannedNotification {
  /**
   * Bare user id of the recipient. Fan-out is the caller's job — one entry per
   * person, because one row addresses exactly one person.
   */
  userId: string;
  /**
   * App-unique, stable key for what this is about. Required by
   * {@link reconcileScheduled}; ignored by {@link scheduleNotification}.
   */
  sourceKey?: string;
  title: string;
  message: string;
  /** Where tapping it lands, e.g. `/home`. */
  url?: string;
  /** RFC3339. Normalized to UTC on write — see {@link toUtcInstant}. */
  sendAt: string;
  sourceCollection?: string;
  sourceId?: string;
}

/** One planned notification before it has been addressed to anybody. */
export type UnaddressedPlan = Omit<PlannedNotification, 'userId'>;

/**
 * Address one planned notification to each of `userIds`.
 *
 * This is where fan-out happens, and it's deliberately the producer's step
 * rather than the dispatcher's: one stored row means one person, so the moment
 * an app knows *who* opted in is the moment it should stop thinking about
 * groups. With nobody opted in this returns nothing, and the reconcile that
 * receives it withdraws whatever was written for them last time.
 */
export function fanOut(
  plan: UnaddressedPlan,
  userIds: readonly string[],
): PlannedNotification[] {
  return userIds.map((userId) => ({ ...plan, userId }));
}

export interface ReconcileOptions {
  /** The firing's clock. */
  now: Date;
  /**
   * Narrow the reconcile to rows whose `source_key` starts with this string.
   *
   * `source_app` is the default scope, which is exactly right while an app has
   * one producer. An app with two — the Home app schedules bin nights *and*
   * upkeep reminders — would otherwise have each run withdraw everything the
   * other wrote, since neither plan contains the other's keys. A prefix splits
   * the app's queue into independent scopes (`pickup:`, `task:`) without
   * inventing a second `source_app`, which is the string the Scheduled tab
   * resolves to an app name and a link.
   *
   * Every planned `sourceKey` must start with it; a plan that doesn't is a
   * programming error and throws rather than quietly writing a row the next
   * run can't see.
   */
  keyPrefix?: string;
}

export interface ReconcileResult {
  created: number;
  updated: number;
  unchanged: number;
  /** Future rows deleted because nothing implies them any more. */
  withdrawn: number;
  /** Rows left alone because they had already been delivered or cancelled. */
  settled: number;
}

/**
 * Normalize an instant to UTC ISO-8601.
 *
 * The dispatcher finds due rows with `send_at <= '<now>'`, which the engine
 * compiles to a SQL string comparison (`engine/filter.ts`). That is only
 * correct for a format that sorts lexicographically in time order, which
 * `toISOString()` output does and a local-offset RFC3339 string
 * (`2026-08-25T18:00:00-07:00`) does not. Normalizing on the way in means no
 * caller has to remember.
 *
 * Throws on an unparseable instant rather than writing a row that would sort
 * arbitrarily and never be delivered.
 */
export function toUtcInstant(value: string): string {
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`scheduled notification: unparseable send_at "${value}"`);
  }
  return new Date(ms).toISOString();
}

function collectionFor(token: string, userId: string) {
  return serverClient(token)
    .collection('users')
    .record(userId)
    .collection<ScheduledNotification>(SCHEDULED_NOTIFICATIONS);
}

/** The stored shape a plan entry maps to. */
function bodyFor(plan: PlannedNotification, sourceApp?: string) {
  return {
    title: plan.title,
    message: plan.message,
    url: plan.url,
    send_at: toUtcInstant(plan.sendAt),
    status: 'scheduled' as const,
    source_app: sourceApp,
    source_key: plan.sourceKey,
    source_collection: plan.sourceCollection,
    source_id: plan.sourceId,
  };
}

/**
 * Queue one notification for one user.
 *
 * `sourceApp` stamps the row as app-raised, which makes it read-only in the
 * Scheduled tab and lets {@link reconcileScheduled} recognise it later. Omit it
 * for something a person asked for directly.
 */
export async function scheduleNotification(
  token: string,
  plan: PlannedNotification,
  sourceApp?: string,
): Promise<ScheduledNotification> {
  return collectionFor(token, plan.userId).create(bodyFor(plan, sourceApp));
}

/**
 * Cancel one queued notification.
 *
 * A status change rather than a delete, deliberately: a row an app raised would
 * be recreated by that app's next reconcile if it simply vanished, so the row
 * has to stay as its own tombstone. Idempotent — a row that has already left
 * `scheduled` is left exactly as it is, so cancelling something that fired a
 * second earlier doesn't rewrite history.
 */
export async function cancelScheduledNotification(
  token: string,
  userId: string,
  id: string,
): Promise<void> {
  const rows = collectionFor(token, userId);
  const row = await rows.record(id).get();
  if (row.status !== 'scheduled') return;
  await rows.record(id).update({ status: 'canceled' });
}

/** True when the stored row already says what the plan says. */
function matches(stored: ScheduledNotification, plan: PlannedNotification): boolean {
  return (
    stored.title === plan.title &&
    stored.message === plan.message &&
    (stored.url ?? undefined) === (plan.url ?? undefined) &&
    stored.send_at === toUtcInstant(plan.sendAt)
  );
}

/**
 * Make this app's queue match `planned`.
 *
 * Only rows carrying `sourceApp` are considered — a reconcile never sees,
 * edits, or sweeps a notification a person scheduled, or one another app
 * raised. An app with more than one producer narrows further with
 * {@link ReconcileOptions.keyPrefix}. Within that scope, rows are keyed by
 * `(user, source_key)`:
 *
 * | Situation                                              | Action    |
 * |--------------------------------------------------------|-----------|
 * | in plan, no row                                          | create    |
 * | in plan, row is `scheduled` and drifted                  | patch     |
 * | in plan, row is `sent`/`canceled`/`missed`/`failed`      | leave     |
 * | not in plan, row is `scheduled` with a future `send_at`  | withdraw  |
 * | any row whose `send_at` has passed                       | leave     |
 *
 * Two invariants hold this together.
 *
 * **Past rows are not this function's to delete.** A row whose moment has
 * passed is the record of what was announced. Old ones are swept by the
 * platform retention cron (`scheduled-notification`'s `retention` declaration:
 * an app's rows, 30 days after `send_at`). That is safe for the same reason a
 * cancelled row can be its own tombstone: a plan only ever contains future
 * keys, so by the time a row is swept its key is out of every horizon and
 * nothing will recreate it.
 *
 * **A moved date is a patch, not a re-announce.** Patching an unsent row's
 * `send_at` moves the delivery; once sent, the row is settled and reconcile
 * leaves it alone. A producer that *wants* "the date moved, say so again" folds
 * the instant into its `source_key` — which is what every key in this repo
 * already does.
 */
export async function reconcileScheduled(
  token: string,
  sourceApp: string,
  planned: readonly PlannedNotification[],
  { now, keyPrefix }: ReconcileOptions,
): Promise<ReconcileResult> {
  const byUser = new Map<string, PlannedNotification[]>();
  for (const plan of planned) {
    if (!plan.sourceKey) {
      throw new Error(
        `reconcileScheduled(${sourceApp}): every planned notification needs a sourceKey`,
      );
    }
    if (keyPrefix && !plan.sourceKey.startsWith(keyPrefix)) {
      throw new Error(
        `reconcileScheduled(${sourceApp}): sourceKey "${plan.sourceKey}" is outside the reconciled scope "${keyPrefix}"`,
      );
    }
    const list = byUser.get(plan.userId);
    if (list) list.push(plan);
    else byUser.set(plan.userId, [plan]);
  }

  const result: ReconcileResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    withdrawn: 0,
    settled: 0,
  };

  // Existing rows live per user, so the sweep has to visit every user — not
  // only the ones in this plan, or withdrawing the last row for someone who
  // just opted out would never happen.
  const users = await serverClient(token).collection<{ id: string }>('users').listAll();

  for (const user of users) {
    const rows = collectionFor(token, user.id);
    const existing = (await rows.listAll()).filter(
      (row) =>
        row.source_app === sourceApp &&
        (!keyPrefix || (row.source_key ?? '').startsWith(keyPrefix)),
    );
    const stored = new Map(
      existing.filter((row) => row.source_key).map((row) => [row.source_key as string, row]),
    );
    const plans = byUser.get(user.id) ?? [];
    const wanted = new Set(plans.map((plan) => plan.sourceKey as string));

    for (const plan of plans) {
      const row = stored.get(plan.sourceKey as string);
      if (!row) {
        await rows.create(bodyFor(plan, sourceApp));
        result.created++;
      } else if (row.status !== 'scheduled') {
        // Delivered, cancelled, or given up on. The plan still implies it, but
        // the row has already had its say.
        result.settled++;
      } else if (matches(row, plan)) {
        result.unchanged++;
      } else {
        await rows.record(row.id).update({
          title: plan.title,
          message: plan.message,
          url: plan.url,
          send_at: toUtcInstant(plan.sendAt),
        });
        result.updated++;
      }
    }

    for (const row of existing) {
      const at = new Date(row.send_at).getTime();
      if (Number.isNaN(at)) continue;
      // Only the future is reconciled: a row whose moment has passed is the
      // record of what was announced, whatever the plan says now.
      if (at <= now.getTime()) continue;
      if (row.status !== 'scheduled') continue;
      if (row.source_key && wanted.has(row.source_key)) continue;
      await rows.record(row.id).delete();
      result.withdrawn++;
    }
  }

  return result;
}
