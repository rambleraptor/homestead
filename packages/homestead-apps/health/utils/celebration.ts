/**
 * Whether a dose just recorded deserves a celebration, and what it says.
 *
 * The vaccine schema carries no required dose count, so "complete" is read
 * from the dose itself: a `dose` written as "2 of 2" (or "2/2") is the last
 * of its series. Failing that, a dose given on or after an overdue
 * `next_due` clears the Overdue badge (see `seriesDueStatus`), which is a
 * win of its own. Pure, so the moment can be unit-tested without the UI.
 */

import { dueStatus, isDueSatisfied } from './due';
import type { Vaccination, VaccinationFormData, Vaccine } from '../types';

export interface Celebration {
  title: string;
  description: string;
}

/** "2 of 2", "2/2", "dose 2 of 3" → { n: 2, of: 2 }; anything else → null. */
export function parseSeriesPosition(dose: string | undefined): { n: number; of: number } | null {
  if (!dose) return null;
  const match = /(\d+)\s*(?:of|\/)\s*(\d+)/i.exec(dose);
  if (!match) return null;
  const n = Number(match[1]);
  const of = Number(match[2]);
  if (!Number.isInteger(n) || !Number.isInteger(of) || of <= 0) return null;
  return { n, of };
}

export function doseCelebration({
  vaccine,
  existingDoses,
  dose,
  todayIso,
}: {
  vaccine: Pick<Vaccine, 'name' | 'next_due'>;
  /** The doses already on record before this one, newest first. */
  existingDoses: readonly Pick<Vaccination, 'date_administered'>[];
  dose: Pick<VaccinationFormData, 'dose' | 'date_administered'>;
  todayIso: string;
}): Celebration | null {
  const position = parseSeriesPosition(dose.dose);
  if (position && position.n >= position.of) {
    return {
      title: 'Series complete',
      description: `${vaccine.name}: ${position.of} of ${position.of} doses recorded.`,
    };
  }

  const wasOverdue =
    dueStatus(vaccine.next_due, todayIso) === 'overdue' &&
    !isDueSatisfied(vaccine.next_due, existingDoses[0]?.date_administered);
  if (wasOverdue && isDueSatisfied(vaccine.next_due, dose.date_administered)) {
    return {
      title: `Caught up on ${vaccine.name}`,
      description: 'The overdue dose is recorded. Set the next due date when you know it.',
    };
  }

  return null;
}
