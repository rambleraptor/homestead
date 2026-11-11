/**
 * Cron scheduler — runs the periodic hooks apps declare via `AppConfig.crons`.
 *
 * On boot, `startServer` hands the aggregated hook list (from the app
 * registry's `getAllCronHooks`) to {@link startCronScheduler}, which sets up
 * one timer per hook — a fixed-cadence `setInterval` for an `intervalSeconds`
 * hook, or a self-rearming `setTimeout` aimed at the next local `dailyAtHour`
 * for a daily hook (see {@link nextDailyFire}). Each firing mints a short-lived admin bearer
 * token in the server's own db — the same mechanism the boot-time schema sync
 * uses — invokes the lazily-imported handler with it, and revokes the token
 * when the handler settles.
 *
 * Every firing runs inside an AEP-151 operation (via the injected
 * {@link OperationStore}): the scheduler creates one before the handler runs
 * and completes it afterwards, so each run leaves a persisted record — status,
 * timing, and the handler's result or error — in the `operations` collection.
 * That's the built-in logging cron jobs get for free. Creating the operation is
 * best-effort: if it fails (e.g. the schema isn't synced yet at boot), the
 * handler still runs so the work isn't skipped.
 *
 * A hook that is still running when its next tick arrives is skipped for that
 * tick (no overlapping runs of the same hook), and a handler that throws is
 * logged and swallowed so a single bad run can't take the process down.
 *
 * Each firing runs through the shared {@link operationRunner}, the same
 * process-wide concurrency pool every other operation uses, so cron work
 * competes for the same `HOMESTEAD_MAX_OPERATIONS` slots instead of being
 * treated separately.
 *
 * Timers are `unref`'d: cron work should never keep the process alive on its
 * own — the HTTP listener does that — so shutdown and short-lived tools/tests
 * aren't blocked by a pending interval.
 */

import type { Database } from './engine/sqlite';
import { nowRFC3339 } from './engine/ids';
import { createLogger } from './log';
import { mintAdminToken } from './bootstrap';
import type { RegisteredCronHook } from '@rambleraptor/homestead-core/apps/registry';
import {
  makeOperationLogger,
  type Operation,
  type OperationLogger,
  type OperationStore,
} from '@rambleraptor/homestead-core/resources/operations';
import { runOperationJob } from '@rambleraptor/homestead-core/resources/operation-runner';

// Named `cronLog` (not `log`) because `runCronHook` has a local `log` — the
// per-operation message function — that would otherwise shadow it.
const cronLog = createLogger('cron');

export interface CronScheduler {
  /** Stop all timers. Idempotent. In-flight handlers are left to finish. */
  stop: () => void;
}

/**
 * The next moment a `dailyAtHour` hook should fire: the next occurrence of
 * `hour`:00 in the host's local timezone at or after `from`. If `from` is
 * already past today's `hour`:00, it rolls to tomorrow. Building the target
 * from the local Y/M/D components (rather than adding a fixed number of ms)
 * keeps it anchored to the wall clock across DST transitions.
 *
 * Exported so the scheduling math can be unit-tested without timers.
 */
export function nextDailyFire(from: Date, hour: number): Date {
  const target = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    hour,
    0,
    0,
    0,
  );
  if (target.getTime() <= from.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

/** The `method` recorded on the operation a cron firing spawns. */
export function cronOperationMethod(id: string): string {
  return `cron:${id}`;
}

/**
 * Run a single hook once, end to end: mint a short-lived admin token, open an
 * operation for the firing, run the lazily-imported handler through the shared
 * concurrency pool, and complete the operation (succeeded with the handler's
 * result, or failed with its error) before revoking the token. Never rejects —
 * a missing admin, a failed operation create, or a throwing handler is logged
 * and swallowed so the scheduler's timer callback stays clean. Exposed (rather
 * than inlined) so the per-firing contract can be unit-tested without timers.
 *
 * The firing is bracketed with a `started` log entry and a terminal
 * `succeeded` / `failed: …` entry, and the handler gets a `log` function to add
 * its own progress entries in between (see {@link OperationLogger}). All of that
 * lands in the operation's `metadata.logs`.
 */
export async function runCronHook(
  db: Database,
  hook: RegisteredCronHook,
  operations: OperationStore,
): Promise<void> {
  let admin: ReturnType<typeof mintAdminToken>;
  try {
    admin = mintAdminToken(db);
  } catch (error) {
    cronLog.error('no admin available; skipping', { hook: hook.id, err: error });
    return;
  }

  // Open the operation up front so the run is visible while it's queued. Best
  // effort: if it can't be created, still run the handler (the work matters
  // more than the record) with a no-op logger. Created `pending` — the run is
  // gated behind the shared runner and may wait for a slot; `start()` promotes
  // it to `running` once one frees.
  const firedAt = nowRFC3339();
  let operation: Operation | undefined;
  try {
    operation = await operations.create({
      token: admin.token,
      method: cronOperationMethod(hook.id),
      title: hook.title ?? hook.id,
      createdBy: admin.userId,
      status: 'pending',
    });
  } catch (error) {
    cronLog.error('could not open an operation; running without one', {
      hook: hook.id,
      err: error,
    });
  }

  const logger: OperationLogger | undefined = operation
    ? makeOperationLogger(operations, { token: admin.token, id: operation.id })
    : undefined;
  // When there's no operation, hand the handler a no-op so it can call
  // ctx.log(...) unconditionally.
  const log = logger ? (m: string) => logger.log(m) : async () => {};

  try {
    // Run through the shared lifecycle helper so cron firings compete for the
    // same `HOMESTEAD_MAX_OPERATIONS` slots as every other operation and share
    // the start → log → complete choreography. `operationId` is undefined when
    // the record couldn't be created — the run still happens, just untracked.
    // The token stays valid across any queue wait; it's revoked in `finally`
    // once the run settles.
    await runOperationJob({
      store: operations,
      token: admin.token,
      operationId: operation?.id,
      log,
      work: async () => {
        const mod = await hook.load();
        return mod.default({
          id: hook.id,
          appId: hook.appId,
          token: admin.token,
          writeOrigin: cronWriteOrigin(hook.id),
          firedAt,
          log,
        });
      },
      timeoutLabel: `cron "${hook.id}"`,
      onError: (error) => cronLog.error('failed', { hook: hook.id, err: error }),
    });
  } finally {
    admin.revoke();
  }
}

/** The origin tag a cron's own writes carry (see `CronContext.writeOrigin`). */
export function cronWriteOrigin(id: string): string {
  return `cron:${id}`;
}

/**
 * Start the interval timers for the given hooks. Returns a handle whose
 * `stop()` clears them (called from the server's `stop()`). Passing an empty
 * list is a no-op that still returns a valid handle. The {@link OperationStore}
 * records each firing (see {@link runCronHook}).
 */
export function startCronScheduler(
  db: Database,
  hooks: RegisteredCronHook[],
  operations: OperationStore,
): CronScheduler {
  const intervalTimers: ReturnType<typeof setInterval>[] = [];
  // Daily hooks re-arm a fresh timeout after every firing, so the handle we
  // must clear on stop() changes over time — track the live set.
  const dailyTimers = new Set<ReturnType<typeof setTimeout>>();
  const running = new Set<string>();
  let stopped = false;

  const tick = async (hook: RegisteredCronHook): Promise<void> => {
    if (running.has(hook.id)) {
      cronLog.warn('still running; skipping this tick', { hook: hook.id });
      return;
    }
    running.add(hook.id);
    try {
      await runCronHook(db, hook, operations);
    } finally {
      running.delete(hook.id);
    }
  };

  // Arm the next firing of a daily hook and re-arm once it has run. Computing
  // the delay fresh each time keeps it locked to the wall clock (and correct
  // across DST) no matter how long a run took or when the process booted.
  const scheduleDaily = (hook: RegisteredCronHook): void => {
    if (stopped) return;
    const now = new Date();
    const delay = Math.max(0, nextDailyFire(now, hook.dailyAtHour!).getTime() - now.getTime());
    const timer = setTimeout(() => {
      dailyTimers.delete(timer);
      void tick(hook).finally(() => scheduleDaily(hook));
    }, delay);
    if (typeof timer.unref === 'function') timer.unref();
    dailyTimers.add(timer);
  };

  for (const hook of hooks) {
    if (hook.runOnStart) void tick(hook);
    if (hook.dailyAtHour !== undefined) {
      scheduleDaily(hook);
    } else {
      const timer = setInterval(() => void tick(hook), hook.intervalSeconds! * 1000);
      // Never let a cron timer alone keep the process alive.
      if (typeof timer.unref === 'function') timer.unref();
      intervalTimers.push(timer);
    }
  }

  if (hooks.length > 0) {
    cronLog.info(`scheduled ${hooks.length} hook(s)`, {
      hooks: hooks.map((h) => h.id).join(', '),
    });
  }

  return {
    stop: () => {
      stopped = true;
      for (const timer of intervalTimers) clearInterval(timer);
      intervalTimers.length = 0;
      for (const timer of dailyTimers) clearTimeout(timer);
      dailyTimers.clear();
    },
  };
}
