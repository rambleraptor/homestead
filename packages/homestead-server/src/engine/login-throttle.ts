/**
 * Failed-sign-in throttle, shared by both password logins (`/users/:login` and
 * `/api/auth/login`) so an attacker can't sidestep it by switching doors.
 *
 * Counted per email (normalized), not per client IP: Homestead usually sits
 * behind a reverse proxy or tunnel, where every request arrives from the same
 * address, so an IP limit would lock the whole household out at once. An
 * address with no account is counted exactly like a real one, so the limit
 * can't be used to tell them apart.
 *
 * A sliding window: after {@link LOGIN_MAX_FAILURES} failures inside
 * {@link LOGIN_WINDOW_MS}, further attempts — correct password or not — are
 * refused until the oldest failure ages out. A success clears the count. The
 * state is in memory: a restart forgets it, which is acceptable for a limit
 * whose job is to make online guessing slow.
 */

import type { Database } from './sqlite';

export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Bound on tracked emails, so a spray of made-up addresses can't grow memory without limit. */
const MAX_TRACKED = 10_000;

function key(email: string): string {
  return email.trim().toLowerCase();
}

export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Seconds until `email` may try again, or 0 when it may try now. */
  retryAfterSeconds(email: string): number {
    const recent = this.recent(key(email));
    if (recent.length < LOGIN_MAX_FAILURES) return 0;
    return Math.max(1, Math.ceil((recent[0]! + LOGIN_WINDOW_MS - this.now()) / 1000));
  }

  recordFailure(email: string): void {
    const k = key(email);
    const recent = this.recent(k);
    recent.push(this.now());
    this.failures.delete(k); // re-insert so Map order tracks recency
    this.failures.set(k, recent);
    if (this.failures.size > MAX_TRACKED) this.evict();
  }

  recordSuccess(email: string): void {
    this.failures.delete(key(email));
  }

  private recent(k: string): number[] {
    const cutoff = this.now() - LOGIN_WINDOW_MS;
    return (this.failures.get(k) ?? []).filter((t) => t > cutoff);
  }

  private evict(): void {
    const cutoff = this.now() - LOGIN_WINDOW_MS;
    for (const [k, times] of this.failures) {
      if (times[times.length - 1]! <= cutoff) this.failures.delete(k);
    }
    // Still over: drop the least recently failed.
    for (const k of this.failures.keys()) {
      if (this.failures.size <= MAX_TRACKED) break;
      this.failures.delete(k);
    }
  }
}

const throttles = new WeakMap<Database, LoginThrottle>();

/** The throttle for one database — every login door into it shares the count. */
export function loginThrottleFor(db: Database): LoginThrottle {
  let t = throttles.get(db);
  if (!t) {
    t = new LoginThrottle();
    throttles.set(db, t);
  }
  return t;
}

/** The message a throttled attempt gets. */
export function throttledMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return `too many failed sign-in attempts; try again in ${minutes} minute${minutes === 1 ? '' : 's'}`;
}
