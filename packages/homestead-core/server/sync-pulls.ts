/**
 * Injection seam for asking the server's pull scheduler to run a connection's
 * pull now — the `:sync` method a pull adds to its connection resource.
 *
 * The scheduler lives in the server (it owns the db and the engine), and core
 * can't import the server (the dependency direction is server → core), so the
 * server installs a trigger at boot, like `setSystemTokenIssuer`.
 */

/** What became of a request to pull a connection now. */
export type PullTriggerResult =
  /** Queued: it runs as soon as a slot frees (or right after a run under way). */
  | 'queued'
  /** No pull is scheduled for that record (it's gone, or not a connection). */
  | 'unknown'
  /** No scheduler is running in this process (it hasn't started yet). */
  | 'unavailable';

export type PullTrigger = (connectionResource: string, path: string) => PullTriggerResult;

let current: PullTrigger | null = null;

/** Install the server's trigger. `null` removes it. */
export function setPullTrigger(trigger: PullTrigger | null): void {
  current = trigger;
}

/** Ask for a pull of the connection at `path` (a record of `connectionResource`). */
export function triggerPull(connectionResource: string, path: string): PullTriggerResult {
  return current ? current(connectionResource, path) : 'unavailable';
}
