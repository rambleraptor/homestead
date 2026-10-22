/**
 * The arithmetic behind the charitable tab, kept out of the hook so it can be
 * tested without React.
 *
 * Two rules do all the work here:
 *
 *   - **Which year a gift counts for** is its `tax_year` when the
 *     acknowledgment states one, and otherwise the year of its donation date.
 *     A check mailed on 30 December is deductible for the year it was sent even
 *     though the letter is dated January.
 *   - **What a gift is worth** is what you gave minus what you got back. A
 *     charity that hands you a $60 tote for a $250 gift has to say so, and only
 *     the $190 is deductible.
 *
 * A gift of goods nobody has valued yet contributes nothing — it is counted in
 * `unvalued` instead, so the number on the page is one you could defend rather
 * than one padded with blanks.
 *
 * A grant from a donor-advised fund contributes nothing either: the deduction
 * was taken when the fund was funded, and claiming the grant too would count
 * the same money twice. It is totalled on its own (`dafGranted`) and never
 * flagged as needing a value or an acknowledgment.
 */

import type {
  CharitableReceipt,
  CharitableStats,
  OrganizationBreakdown,
  YearSummary,
} from './types';

/**
 * The IRS threshold above which a donation needs a written acknowledgment to be
 * deductible at all. Applied to the amount given, not the deductible remainder.
 */
export const ACKNOWLEDGMENT_THRESHOLD = 250;

/** The tax year a receipt counts for: what it says, else when it was given. */
export function effectiveYear(receipt: CharitableReceipt): number | undefined {
  if (typeof receipt.tax_year === 'number' && Number.isFinite(receipt.tax_year)) {
    return receipt.tax_year;
  }
  const parsed = new Date(receipt.donation_date);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.getFullYear();
}

/** Granted out of a donor-advised fund rather than paid by the donor. */
export function isDafGrant(receipt: CharitableReceipt): boolean {
  return receipt.source === 'DAF';
}

/** What a receipt is actually worth as a deduction: given minus received back. */
export function deductibleAmount(receipt: CharitableReceipt): number {
  if (isDafGrant(receipt)) return 0;
  if (typeof receipt.amount !== 'number' || !Number.isFinite(receipt.amount)) return 0;
  const received =
    typeof receipt.value_received === 'number' && Number.isFinite(receipt.value_received)
      ? receipt.value_received
      : 0;
  return Math.max(0, receipt.amount - received);
}

/** A gift of goods still waiting for its owner to put a number on it. */
export function isUnvalued(receipt: CharitableReceipt): boolean {
  if (isDafGrant(receipt)) return false;
  return typeof receipt.amount !== 'number' || !Number.isFinite(receipt.amount);
}

/** Whether the paperwork that makes a $250+ gift deductible is on file. */
export function isSubstantiated(receipt: CharitableReceipt): boolean {
  return Boolean(receipt.receipt_file || receipt.source_document);
}

/** A $250-or-more gift with nothing on file to back it up. */
export function needsAcknowledgment(receipt: CharitableReceipt): boolean {
  return (
    !isDafGrant(receipt) &&
    (receipt.amount ?? 0) >= ACKNOWLEDGMENT_THRESHOLD &&
    !isSubstantiated(receipt)
  );
}

/** Every receipt that counts for `year`. */
export function receiptsForYear(
  receipts: CharitableReceipt[],
  year: number,
): CharitableReceipt[] {
  return receipts.filter((r) => effectiveYear(r) === year);
}

/** Per-year totals, newest year first. Drives the picker and the by-year table. */
export function summarizeYears(receipts: CharitableReceipt[]): YearSummary[] {
  const byYear = new Map<number, YearSummary>();
  for (const receipt of receipts) {
    const year = effectiveYear(receipt);
    if (year === undefined) continue;
    const summary =
      byYear.get(year) ?? { year, total: 0, cash: 0, nonCash: 0, count: 0 };
    const deductible = deductibleAmount(receipt);
    summary.total += deductible;
    if (receipt.gift_type === 'Cash') summary.cash += deductible;
    else summary.nonCash += deductible;
    summary.count += 1;
    byYear.set(year, summary);
  }
  return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
}

/** Giving by organization within one year's receipts, largest first. */
export function summarizeOrganizations(
  receipts: CharitableReceipt[],
): OrganizationBreakdown[] {
  const byOrg = new Map<string, OrganizationBreakdown>();
  for (const receipt of receipts) {
    const organization = receipt.organization?.trim() || 'Unknown';
    const entry =
      byOrg.get(organization) ?? { organization, total: 0, count: 0 };
    entry.total += deductibleAmount(receipt);
    entry.count += 1;
    byOrg.set(organization, entry);
  }
  return Array.from(byOrg.values()).sort((a, b) => b.total - a.total);
}

/**
 * Everything the tab renders for one year. `years` spans all receipts (the
 * picker has to offer years the current selection isn't in); every other figure
 * is scoped to `year`.
 */
export function computeCharitableStats(
  receipts: CharitableReceipt[],
  year: number,
): CharitableStats {
  const scoped = receiptsForYear(receipts, year);
  const ownGifts = scoped.filter((r) => !isDafGrant(r));
  const dafGrants = scoped.filter(isDafGrant);
  const cashGifts = ownGifts.filter((r) => r.gift_type === 'Cash');
  const nonCashGifts = ownGifts.filter((r) => r.gift_type !== 'Cash');
  const sum = (items: CharitableReceipt[]) =>
    items.reduce((acc, r) => acc + deductibleAmount(r), 0);

  return {
    year,
    total: sum(scoped),
    cash: sum(cashGifts),
    nonCash: sum(nonCashGifts),
    count: scoped.length,
    cashCount: cashGifts.length,
    nonCashCount: nonCashGifts.length,
    dafGranted: dafGrants.reduce((acc, r) => acc + (r.amount ?? 0), 0),
    dafCount: dafGrants.length,
    unvalued: scoped.filter(isUnvalued).length,
    missingAcknowledgment: scoped.filter(needsAcknowledgment).length,
    organizationBreakdown: summarizeOrganizations(scoped),
    years: summarizeYears(receipts),
  };
}

/**
 * The year the tab opens on: the current year when there's anything in it (or
 * nothing anywhere), otherwise the most recent year with a donation — so a tab
 * opened in January doesn't greet you with an empty page while last year's
 * giving sits one click away.
 */
export function defaultYear(years: YearSummary[], currentYear: number): number {
  if (years.length === 0) return currentYear;
  if (years.some((y) => y.year === currentYear)) return currentYear;
  return years[0].year;
}
