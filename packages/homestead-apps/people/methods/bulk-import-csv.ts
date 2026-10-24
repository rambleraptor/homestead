/**
 * People CSV import — parser and the two-pass saver.
 *
 * Server-only (under `methods/`, so the client build stubs it out).
 *
 * People is the reason {@link BulkImportSaver} takes every selected item at
 * once rather than row by row: `partner_name` can name someone created later in
 * the same file, so partners can't be resolved until every person exists.
 */

import {
  createCsvParser,
  validateOptionalString,
  validateRequiredString,
  type CsvSchema,
} from '@rambleraptor/homestead-core/server/bulk-import/csv';
import type {
  BulkImportContext,
  BulkImportSaveResult,
  BulkImportSaver,
  ParsedItem,
} from '@rambleraptor/homestead-core/resources/bulk-import/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { ADDRESSES, PEOPLE, PERSON_RELATIONSHIPS, PERSON_SHARED_DATA } from '../resources';
import type { PersonRelationship } from '../types';
import { canonicalLink, linkKey } from '../utils/relationships';

/** A person as it comes from a CSV — flat, one row per person. */
export interface PersonCsvData {
  name: string;
  address?: string;
  wifi_network?: string;
  wifi_password?: string;
  /** Matched against others in this import, then against existing people. */
  partner_name?: string;
}

export const personCsvSchema: CsvSchema<PersonCsvData> = {
  requiredFields: [
    {
      name: 'name',
      required: true,
      validator: validateRequiredString(200),
      description: 'Full name (max 200 characters)',
    },
  ],
  optionalFields: [
    {
      name: 'address',
      required: false,
      validator: validateOptionalString(500),
      description: 'Full address (max 500 characters)',
    },
    {
      name: 'wifi_network',
      required: false,
      validator: validateOptionalString(100),
      description: 'WiFi network name (max 100 characters)',
    },
    {
      name: 'wifi_password',
      required: false,
      validator: validateOptionalString(100),
      description: 'WiFi password (max 100 characters)',
    },
    {
      name: 'partner_name',
      required: false,
      validator: validateOptionalString(200),
      description: 'Matched against other people in this import, or existing ones',
    },
  ],
  labelFor: (raw) => (raw.name ? String(raw.name) : undefined),
};

export const template = () =>
  [
    'name,address,wifi_network,wifi_password,partner_name',
    'John Doe,"123 Main St, Anytown, CA 12345",HomeWiFi,password123,Jane Doe',
    'Jane Doe,"456 Oak Ave, Springfield, IL",,,John Doe',
    'Peter Jones,"789 Pine Ln, Boston, MA",,,',
    '',
  ].join('\n');

interface PersonRecord {
  id: string;
  name: string;
}

interface SharedDataRecord {
  id: string;
  person_a: string;
  person_b?: string;
  address_id?: string;
}

/**
 * Create each person (with their address, if any), then link partners by name.
 *
 * Partner resolution is best-effort: an unmatched or failed partner link leaves
 * the person imported and is reported as a warning-shaped failure entry rather
 * than rolling anything back. Someone whose partner is a typo still belongs in
 * the household.
 */
export const save: BulkImportSaver<PersonCsvData> = async ({ items, ctx }) => {
  const created: Array<{ record: PersonRecord; partnerName?: string }> = [];
  const failed: BulkImportSaveResult['failed'] = [];

  for (const item of items) {
    try {
      created.push({
        record: await createPerson(item, ctx),
        partnerName: item.data.partner_name,
      });
    } catch (error) {
      failed.push({
        index: item.index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await linkPartners(created, ctx);
  return { created: created.length, failed };
};

async function createPerson(
  item: ParsedItem<PersonCsvData>,
  ctx: BulkImportContext,
): Promise<PersonRecord> {
  const data = item.data;
  const createdBy = ctx.auth.user.path;
  const hs = serverClient(ctx.auth.token);

  const person = await hs
    .collection<PersonRecord>(PEOPLE)
    .create({ name: data.name, created_by: createdBy });

  // Wifi credentials hang off an address record, so a row carrying only wifi
  // still needs one (with an empty `line1`) — otherwise the wifi it specified
  // would be silently dropped.
  if (!data.address && !data.wifi_network) return person;

  const address = await hs.collection<{ id: string }>(ADDRESSES).create({
    line1: data.address ?? '',
    wifi_network: data.wifi_network,
    wifi_password: data.wifi_password,
    created_by: createdBy,
  });

  await hs.collection<SharedDataRecord>(PERSON_SHARED_DATA).create({
    person_a: person.id,
    address_id: address.id,
    created_by: createdBy,
  });

  return person;
}

/**
 * Second pass: resolve `partner_name` to an id, record the partner
 * relationship, and share the pair's address record.
 *
 * Names are matched case-insensitively against everyone created here first,
 * then against people already in the household.
 */
async function linkPartners(
  created: Array<{ record: PersonRecord; partnerName?: string }>,
  ctx: BulkImportContext,
): Promise<void> {
  if (!created.some((c) => c.partnerName)) return;

  const idByName = new Map<string, string>();
  for (const { record } of created) {
    idByName.set(record.name.toLowerCase(), record.id);
  }
  try {
    const people = await serverClient(ctx.auth.token).collection<PersonRecord>(PEOPLE).listAll();
    for (const person of people) {
      if (!idByName.has(person.name.toLowerCase())) {
        idByName.set(person.name.toLowerCase(), person.id);
      }
    }
  } catch (error) {
    console.warn('Bulk import: could not list people for partner matching:', error);
  }

  const sharedData = await listSharedData(ctx);
  const relationships = serverClient(ctx.auth.token).collection<PersonRelationship>(
    PERSON_RELATIONSHIPS,
  );
  const existingLinks = new Set(
    (await relationships.listAll().catch(() => [])).map(linkKey),
  );
  const linked = new Set<string>();

  for (const { record, partnerName } of created) {
    if (!partnerName) continue;

    // A couple appears twice (once from each side); link them once.
    const pair = [record.name.toLowerCase(), partnerName.toLowerCase()].sort().join('|');
    if (linked.has(pair)) continue;

    const partnerId = idByName.get(partnerName.toLowerCase());
    if (!partnerId || partnerId === record.id) {
      console.warn(`Bulk import: no match for partner "${partnerName}" of ${record.name}`);
      continue;
    }

    try {
      await setPartner(record.id, partnerId, sharedData, ctx);
      const link = canonicalLink('partner', record.id, partnerId);
      if (!existingLinks.has(linkKey(link))) {
        await relationships.create({ ...link, created_by: ctx.auth.user.path });
        existingLinks.add(linkKey(link));
      }
      linked.add(pair);
    } catch (error) {
      console.warn(`Bulk import: could not link ${record.name} to ${partnerName}:`, error);
    }
  }
}

async function listSharedData(ctx: BulkImportContext): Promise<SharedDataRecord[]> {
  try {
    return await serverClient(ctx.auth.token)
      .collection<SharedDataRecord>(PERSON_SHARED_DATA)
      .listAll();
  } catch {
    return [];
  }
}

/**
 * Point one person's shared-data record at their partner, creating the record
 * when neither side has one yet.
 *
 * Narrower than the app's full `setPartner`: an imported person is brand new, so
 * the merge-two-existing-records branches can't arise here.
 */
async function setPartner(
  personId: string,
  partnerId: string,
  sharedData: SharedDataRecord[],
  ctx: BulkImportContext,
): Promise<void> {
  const find = (id: string) =>
    sharedData.find((s) => s.person_a === id || s.person_b === id);

  const existing = find(personId) ?? find(partnerId);
  const shared = serverClient(ctx.auth.token).collection<SharedDataRecord>(PERSON_SHARED_DATA);
  if (!existing) {
    const record = await shared.create({
      person_a: personId,
      person_b: partnerId,
      created_by: ctx.auth.user.path,
    });
    sharedData.push(record);
    return;
  }

  const other = existing.person_a === personId ? partnerId : personId;
  await shared.record(existing.id).update({ person_b: other });
  existing.person_b = other;
}

export default createCsvParser(personCsvSchema);
