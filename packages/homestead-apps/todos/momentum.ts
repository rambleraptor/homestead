/**
 * Momentum: what the household has been finishing lately, as two numbers.
 *
 * - `doneThisWeek`: todos completed in the last seven days.
 * - `streak`: consecutive calendar days, ending today or yesterday, on each of
 *   which at least one todo was completed. Yesterday counts as the end so the
 *   streak doesn't read as broken at breakfast, before today's first tick.
 *
 * Only todos feed this. Groceries are the other thing people check off, but a
 * grocery item that was checked off and then cleared is *deleted* — there is
 * no record left to count — so counting them would make the number fall
 * every time the list was tidied. Todos keep their `completed` row.
 *
 * Days are local-time days: "did I finish something today" is a question
 * about the person's calendar, not UTC's. Everything here is pure so the
 * boundary cases (midnight, a gap, nothing at all) are testable without a
 * clock.
 */

export interface Momentum {
  doneThisWeek: number;
  streak: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Streak lengths worth a word, in days. */
export const STREAK_MILESTONES: readonly number[] = [7, 30];

/** `YYYY-MM-DD` for a moment, in local time. */
export function localDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The same moment, `days` calendar days earlier (DST-safe: counted on the calendar). */
function daysBefore(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);
}

/**
 * The two numbers for a set of completion times (RFC 3339 strings or Dates),
 * as of `now`. Unparseable or future timestamps are ignored.
 */
export function computeMomentum(
  completedAt: ReadonlyArray<string | Date>,
  now: Date,
): Momentum {
  const times = completedAt
    .map((value) => (value instanceof Date ? value.getTime() : Date.parse(value)))
    .filter((t) => Number.isFinite(t) && t <= now.getTime());

  const doneThisWeek = times.filter((t) => now.getTime() - t < WEEK_MS).length;

  const days = new Set(times.map((t) => localDayKey(new Date(t))));
  let streak = 0;
  // Start on today if something was finished today, else on yesterday.
  let cursor = days.has(localDayKey(now)) ? now : daysBefore(now, 1);
  while (days.has(localDayKey(cursor))) {
    streak += 1;
    cursor = daysBefore(cursor, 1);
  }

  return { doneThisWeek, streak };
}

/** The chip's one line: "3-day streak · 5 done this week", or `null` with nothing to say. */
export function momentumHeadline({ doneThisWeek, streak }: Momentum): string | null {
  if (doneThisWeek === 0) return null;
  const parts = [];
  if (streak > 0) parts.push(`${streak}-day streak`);
  parts.push(`${doneThisWeek} done this week`);
  return parts.join(' · ');
}

/**
 * The storage key that remembers a milestone was celebrated: per person, per
 * milestone, per day, so a second completion on the day the streak reached 7
 * doesn't celebrate it again, and reaching 7 again next month does.
 */
export function milestoneKey(userId: string, milestone: number, day: string): string {
  return `todos:momentum:${userId}:${milestone}:${day}`;
}
