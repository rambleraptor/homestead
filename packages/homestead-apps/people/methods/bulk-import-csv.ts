/**
 * People CSV import — parser and the two-pass saver.
 *
 * Server-only (under `methods/`, so the client build stubs it out).
 *
 * People is the reason {@link BulkImportSaver} takes every selected item at
 * once rather than row by row: `partner_name` can name someone created later in
 * the same file, and rows sharing an address share one household, so neither
 * can be resolved until every person exists.
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
import { HOUSEHOLDS, PEOPLE, PERSON_RELATIONSHIPS } from '../resources';
import type { Household, PersonRelationship } from '../types';
import { canonicalLink, linkKey } from '../utils/relationships';
import { householdNameFor, householdsFor, memberIds } from '../utils/households';

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

interface Created {
  record: PersonRecord;
  data: PersonCsvData;
}

/**
 * Create each person, link partners by name, then group everyone into
 * households.
 *
 * Rows with the same address (or, with no address, the same WiFi network) share
 * one household. A partner with no address of their own joins their partner's
 * household — a new one from this file, or an existing person's.
 *
 * Partner resolution is best-effort: an unmatched or failed partner link leaves
 * the person imported rather than rolling anything back. Someone whose partner
 * is a typo still belongs in the household.
 */
export const save: BulkImportSaver<PersonCsvData> = async ({ items, ctx }) => {
  const created: Created[] = [];
  const failed: BulkImportSaveResult['failed'] = [];

  for (const item of items) {
    try {
      created.push({ record: await createPerson(item, ctx), data: item.data });
    } catch (error) {
      failed.push({
        index: item.index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const partners = await linkPartners(created, ctx);
  await createHouseholds(created, partners, ctx);
  return { created: created.length, failed };
};

async function createPerson(
  item: ParsedItem<PersonCsvData>,
  ctx: BulkImportContext,
): Promise<PersonRecord> {
  return serverClient(ctx.auth.token)
    .collection<PersonRecord>(PEOPLE)
    .create({ name: item.data.name, created_by: ctx.auth.user.path });
}

/**
 * Second pass: resolve `partner_name` to an id and record the partner
 * relationship. Returns each imported person's partner id.
 *
 * Names are matched case-insensitively against everyone created here first,
 * then against people already in the household.
 */
async function linkPartners(created: Created[], ctx: BulkImportContext): Promise<Map<string, string>> {
  const partnerOf = new Map<string, string>();
  if (!created.some((c) => c.data.partner_name)) return partnerOf;

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

  const relationships = serverClient(ctx.auth.token).collection<PersonRelationship>(
    PERSON_RELATIONSHIPS,
  );
  const existingLinks = new Set(
    (await relationships.listAll().catch(() => [])).map(linkKey),
  );

  for (const { record, data } of created) {
    const partnerName = data.partner_name;
    if (!partnerName) continue;

    const partnerId = idByName.get(partnerName.toLowerCase());
    if (!partnerId || partnerId === record.id) {
      console.warn(`Bulk import: no match for partner "${partnerName}" of ${record.name}`);
      continue;
    }
    partnerOf.set(record.id, partnerId);

    // A couple appears twice (once from each side); link them once.
    const link = canonicalLink('partner', record.id, partnerId);
    if (existingLinks.has(linkKey(link))) continue;
    try {
      await relationships.create({ ...link, created_by: ctx.auth.user.path });
      existingLinks.add(linkKey(link));
    } catch (error) {
      console.warn(`Bulk import: could not link ${record.name} to ${partnerName}:`, error);
    }
  }
  return partnerOf;
}

/** Rows that should share a household get the same key. */
function householdKey(data: PersonCsvData): string | undefined {
  const address = data.address?.trim().toLowerCase();
  if (address) return `address:${address}`;
  const wifi = data.wifi_network?.trim().toLowerCase();
  return wifi ? `wifi:${wifi}` : undefined;
}

/** Third pass: create the households and fill in their members. */
async function createHouseholds(
  created: Created[],
  partnerOf: Map<string, string>,
  ctx: BulkImportContext,
): Promise<void> {
  const groups = new Map<string, Created[]>();
  for (const entry of created) {
    const key = householdKey(entry.data);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  const hs = serverClient(ctx.auth.token);
  const households = hs.collection<Household>(HOUSEHOLDS);
  const keyOf = new Map<string, string>();
  for (const [key, group] of groups) {
    for (const { record } of group) keyOf.set(record.id, key);
  }

  // A person with no address of their own follows their partner.
  const joiners = new Map<string, string[]>(); // household key -> person ids
  const joinExisting: Array<{ personId: string; partnerId: string }> = [];
  for (const { record } of created) {
    if (keyOf.has(record.id)) continue;
    const partnerId = partnerOf.get(record.id);
    if (!partnerId) continue;
    const partnerKey = keyOf.get(partnerId);
    if (partnerKey) {
      joiners.set(partnerKey, [...(joiners.get(partnerKey) ?? []), record.id]);
    } else if (!created.some((c) => c.record.id === partnerId)) {
      joinExisting.push({ personId: record.id, partnerId });
    }
  }

  for (const [key, group] of groups) {
    const first = group[0].data;
    const members = [...group.map((g) => g.record.id), ...(joiners.get(key) ?? [])];
    const names = members.map((id) => created.find((c) => c.record.id === id)?.record.name ?? '');
    try {
      await households.create({
        name: householdNameFor(names),
        members,
        line1: first.address?.trim() || undefined,
        wifi_network: group.find((g) => g.data.wifi_network)?.data.wifi_network,
        wifi_password: group.find((g) => g.data.wifi_password)?.data.wifi_password,
        created_by: ctx.auth.user.path,
      });
    } catch (error) {
      console.warn(`Bulk import: could not create household for ${names.join(', ')}:`, error);
    }
  }

  if (joinExisting.length === 0) return;
  const existing = await households.listAll().catch(() => [] as Household[]);
  for (const { personId, partnerId } of joinExisting) {
    for (const household of householdsFor(partnerId, existing)) {
      const members = [...memberIds(household), personId];
      try {
        await households.record(household.id).update({ members });
        household.members = members;
      } catch (error) {
        console.warn(`Bulk import: could not add ${personId} to ${household.name}:`, error);
      }
    }
  }
}

export default createCsvParser(personCsvSchema);
