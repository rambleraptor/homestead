/**
 * post_classify hook for the `charitable-donation-receipt` doc type.
 *
 * When a document is classified as a charity's acknowledgment, mirror it into
 * the Receipts app's charitable tab so it counts towards the year's deduction
 * total. The document already stores the file, so the created record carries no
 * file of its own — it links back via `source_document` (see
 * `receipts/charitable/resources.ts`, where `receipt_file` is optional for
 * exactly this case), which is also what satisfies the written-acknowledgment
 * rule on a gift of $250 or more.
 *
 * Server-only (`.server.ts`): the client build stubs this module, so its
 * cross-app import and the aepbase helper never reach the browser bundle. It is
 * only ever reached through the lazy `post_classify` thunk on the doc type.
 */

import { serverClient } from '@rambleraptor/homestead-core/server/client';
import type { PostClassifyHandler } from '../docType';
import { DOCUMENTS } from '../../resources';
import { CHARITABLE_RECEIPTS } from '../../../receipts/charitable/resources';
import type {
  CharitableReceipt,
  GiftType,
} from '../../../receipts/charitable/types';
import { PEOPLE } from '../../../people/resources';
import type { Person } from '../../../people/types';
import { matchPersonByName } from '../../../people/utils/matchPerson';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Coerce the acknowledgment's printed date to a date-time string (the field's
 * format). The model records the date as printed — often `YYYY-MM-DD` — so
 * widen it to a parseable instant; fall back to the document's own timestamps
 * if it's absent or unreadable, since `donation_date` is required.
 */
function toDateTime(printed: string | undefined, fallback: string): string {
  if (printed) {
    const parsed = new Date(printed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback;
}

/**
 * What kind of gift this was, inferred rather than asked for: the doc type
 * already splits a stated cash amount from a described pile of goods, so the
 * two fields between them say which it is without a second model call. Neither
 * present is a gift we can't characterize — stock, mileage, a wire transfer the
 * letter describes in prose — and `Other` is the honest label for it.
 */
function inferGiftType(amount: number | undefined, property: string | undefined): GiftType {
  if (amount !== undefined) return 'Cash';
  if (property) return 'Goods';
  return 'Other';
}

/**
 * Resolve a printed donor name to a canonical `person` record, so a
 * document-created donation links to a person the same way the capture form
 * does. Best-effort enrichment: an unreadable people list, or a name matching
 * zero or more than one person, just leaves the receipt with its donor string —
 * never blocks creation.
 */
async function resolvePersonPath(
  name: string,
  token: string,
): Promise<string | undefined> {
  try {
    const people = await serverClient(token).collection<Person>(PEOPLE).listAll();
    // Empty `aliases` may come back absent; `matchPersonByName` spreads it.
    const normalized = people.map((p) => ({ ...p, aliases: p.aliases ?? [] }));
    const matched = matchPersonByName(name, normalized);
    return matched ? `${PEOPLE}/${matched.id}` : undefined;
  } catch {
    return undefined;
  }
}

/** A plausible four-digit tax year, or nothing — a stray value is worse than none. */
function taxYear(value: unknown): number | undefined {
  const year = asNumber(value);
  return year !== undefined && Number.isInteger(year) && year >= 1900 && year <= 2999
    ? year
    : undefined;
}

const handler: PostClassifyHandler = async ({ document, metadata, auth }) => {
  const fallbackDate =
    document.create_time ?? document.update_time ?? new Date().toISOString();
  const amount = asNumber(metadata.donation_amount);
  const property = asString(metadata.description_of_property);

  const receipt: Record<string, unknown> = {
    organization:
      asString(metadata.organization_name) ?? document.title ?? 'Unknown organization',
    donation_date: toDateTime(asString(metadata.donation_date), fallbackDate),
    gift_type: inferGiftType(amount, property),
    // A letter that names the fund the gift came from is a DAF grant — not
    // deductible, so the tab keeps it out of the year's total.
    source: asString(metadata.donor_advised_fund) ? 'DAF' : 'Self',
    status: 'Unclaimed',
    source_document: `${DOCUMENTS}/${document.id}`,
  };

  // A gift of goods arrives unvalued: the charity describes what it received but
  // never puts a number on it, and guessing one here would be inventing a
  // deduction. It lands blank and the tab asks its owner for a value.
  if (amount !== undefined) receipt.amount = amount;
  if (property) receipt.description_of_property = property;

  const ein = asString(metadata.organization_ein);
  if (ein) receipt.organization_ein = ein;
  const year = taxYear(metadata.tax_year);
  if (year !== undefined) receipt.tax_year = year;
  // Kept verbatim: on a gift of $250 or more this sentence is what makes the
  // deduction allowable, so it's stored as written rather than summarized.
  const goodsOrServices = asString(metadata.goods_or_services);
  if (goodsOrServices) receipt.goods_or_services = goodsOrServices;

  const donor = asString(metadata.donor_name);
  if (donor) {
    receipt.donor = donor;
    const personPath = await resolvePersonPath(donor, auth.token);
    if (personPath) receipt.person = personPath;
  }
  if (document.created_by) receipt.created_by = document.created_by;

  const created = await serverClient(auth.token)
    .collection<CharitableReceipt>(CHARITABLE_RECEIPTS)
    .create(receipt);
  return { linked_resource: `${CHARITABLE_RECEIPTS}/${created.id}` };
};

export default handler;
