import type { DueStatus } from '../types';

/** A `next_due` within this many days of today counts as "due soon". */
export const DUE_SOON_DAYS = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Anything carrying the series-level due date — in practice, a Vaccine. */
export interface DueDated {
  next_due?: string;
}

/** Parse an ISO YYYY-MM-DD as a UTC day, so comparisons ignore time of day. */
function parseIsoDay(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Whole days from `todayIso` until `dueIso` (negative when past). Null for
 * an unparseable date.
 */
export function daysUntil(dueIso: string, todayIso: string): number | null {
  const due = parseIsoDay(dueIso);
  const today = parseIsoDay(todayIso);
  if (due === null || today === null) return null;
  return Math.round((due - today) / MS_PER_DAY);
}

/**
 * Classify a vaccine's `next_due` relative to today: `overdue` (past),
 * `due-soon` (within {@link DUE_SOON_DAYS}), `ok` (further out), or `none`
 * when there is no parseable due date (series complete / unknown).
 */
export function dueStatus(
  nextDue: string | undefined,
  todayIso: string,
): DueStatus {
  if (!nextDue) return 'none';
  const days = daysUntil(nextDue, todayIso);
  if (days === null) return 'none';
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due-soon';
  return 'ok';
}

/**
 * The vaccines needing attention — overdue or due within the window — sorted
 * soonest-first so the most urgent lead. Powers the "due soon" strip on the
 * Health home.
 */
export function dueSoon<T extends DueDated>(
  vaccines: readonly T[],
  todayIso: string,
): T[] {
  return vaccines
    .filter((v) => {
      const status = dueStatus(v.next_due, todayIso);
      return status === 'overdue' || status === 'due-soon';
    })
    .sort((a, b) => (a.next_due ?? '').localeCompare(b.next_due ?? ''));
}

/**
 * True when a dose given on `lastDoseIso` lands on or after `nextDue`: the
 * due date has been met, so the series is no longer overdue (or due) even
 * though `next_due` still holds the old date until the person sets the next
 * one. Both are ISO YYYY-MM-DD; anything unparseable is "not satisfied".
 */
export function isDueSatisfied(
  nextDue: string | undefined,
  lastDoseIso: string | undefined,
): boolean {
  if (!nextDue || !lastDoseIso) return false;
  const days = daysUntil(nextDue, lastDoseIso);
  return days !== null && days <= 0;
}

/**
 * A series' due-state once its dose history is known: a dose given on or
 * after `next_due` clears the date, so the badge reads as complete rather
 * than overdue. `latestDoseIso` is the newest `date_administered`, if any.
 */
export function seriesDueStatus(
  nextDue: string | undefined,
  latestDoseIso: string | undefined,
  todayIso: string,
): DueStatus {
  if (isDueSatisfied(nextDue, latestDoseIso)) return 'none';
  return dueStatus(nextDue, todayIso);
}

/** Today as ISO YYYY-MM-DD in the local timezone. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
