/**
 * Cron hooks — periodic server-side work an app schedules.
 *
 * An app declares `crons: CronHook[]` on its {@link AppConfig}; the server's
 * scheduler (`packages/homestead-server/src/cron.ts`) starts a timer per hook
 * on boot and invokes the lazily-imported handler on the hook's schedule. A
 * hook picks exactly one schedule: a fixed cadence via `intervalSeconds`, or a
 * daily wall-clock firing via `dailyAtHour` (server-local time).
 *
 * Handlers run without a user request, so the scheduler mints a short-lived
 * admin bearer token per firing (like the boot-time schema sync) and hands it
 * to the handler on {@link CronContext.token}. Pair it with the shared client
 * (`serverClient(token)` from `@rambleraptor/homestead-core/server/client`) to
 * read or write engine data.
 *
 * Every firing runs inside an AEP-151 **operation** — the scheduler creates one
 * before invoking the handler and completes it (succeeded/failed) afterwards —
 * so each run leaves a persisted record (status, timing, result, or error) in
 * the `operations` collection, visible in the Operations app. The value a
 * handler resolves becomes the operation's `response`; anything it throws
 * becomes the operation's `error`.
 *
 * The handler is referenced through a lazy `import()` — the same convention as
 * AEP-136 custom methods — so the server-only code stays out of the client
 * bundle. Keep handler modules under the app's `crons/` (or `methods/`)
 * directory, or name them `*.server.ts`, so the production build stubs them out
 * of the browser bundle (see `packages/homestead-app/vite.config.ts`).
 */

/**
 * Context passed to a cron handler each time the scheduler fires it.
 */
export interface CronContext {
  /** The firing hook's declared {@link CronHook.id}. */
  id: string;
  /** Id of the app that declared the hook. */
  appId: string;
  /**
   * Short-lived admin bearer token for engine access via the server-side
   * aepbase helpers. Minted for this firing and revoked once the handler
   * settles — don't retain it past the handler's lifetime.
   */
  token: string;
  /**
   * The origin tag for this handler's writes: `cron:<id>`. Pass it to
   * `serverClient` (`{ origin: ctx.writeOrigin }`) so a resource sync can tell
   * the cron's writes from a person's — an outbound mirror skips what an
   * inbound import wrote by checking `origin` in its `when`.
   */
  writeOrigin: string;
  /** RFC3339 timestamp of this firing. */
  firedAt: string;
  /**
   * Append a status/progress entry to this firing's operation log
   * (`metadata.logs`). The most recent entry surfaces as the operation's
   * current status in the Operations app while it runs. Never throws — a
   * logging failure is swallowed — and is safe to `await` (for ordering) or
   * ignore.
   *
   * The scheduler brackets each firing with a `started` entry and a terminal
   * `succeeded` / `failed: …` entry automatically; use this for the steps in
   * between (e.g. `await ctx.log('processed 5 of 20')`).
   */
  log: (message: string) => Promise<void>;
}

/**
 * A cron handler. Runs to completion (or rejection); the scheduler logs and
 * swallows a rejection so one bad run can't take the process down, and skips
 * the next tick if a previous run of the same hook is still in flight.
 *
 * The resolved value is recorded as the firing's operation `response` (return
 * a small summary object — e.g. `{ processed: 5 }` — for useful logging), and
 * a thrown value becomes the operation `error`. Returning nothing is fine; the
 * operation still records success and timing.
 */
export type CronHandler = (
  ctx: CronContext,
) => Promise<Record<string, unknown> | void>;

/**
 * Declarative description of a single periodic hook an app schedules.
 */
export interface CronHook {
  /**
   * Stable id, unique across every app's hooks. Used to label log output and
   * to guard against overlapping runs. The registry drops a hook whose id
   * collides with one already seen.
   */
  id: string;

  /**
   * Human-readable label for the operation each firing spawns, shown in the
   * Operations app (e.g. `'Weekly grocery digest'`). Defaults to the hook's
   * {@link id}.
   */
  title?: string;

  /**
   * Seconds between firings. The scheduler runs the handler every
   * `intervalSeconds` seconds for as long as the server is up. Must be a
   * positive number; the registry drops a hook with a non-positive interval.
   *
   * Mutually exclusive with {@link dailyAtHour} — declare exactly one. The
   * registry drops a hook that declares neither or both.
   */
  intervalSeconds?: number;

  /**
   * Fire once a day at this hour (0–23) in the **server's local timezone**,
   * on the minute boundary (HH:00). The scheduler aims each firing at the next
   * occurrence of this hour and reschedules after every run, so it lands on the
   * wall clock regardless of when the process booted and re-derives across DST.
   *
   * Mutually exclusive with {@link intervalSeconds} — declare exactly one. The
   * registry drops a hook whose hour is outside 0–23.
   */
  dailyAtHour?: number;

  /**
   * Also run the handler once immediately at boot, in addition to the recurring
   * schedule. Defaults to `false` (first run is one interval — or one day —
   * in). Useful for a daily hook that should catch up if the server was down at
   * its usual hour.
   */
  runOnStart?: boolean;

  /**
   * Lazy import of the handler module. The scheduler awaits this on demand and
   * invokes the default export.
   */
  load: () => Promise<{ default: CronHandler }>;
}
