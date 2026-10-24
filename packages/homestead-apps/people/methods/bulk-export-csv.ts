/**
 * People CSV export — serializer and the joining source.
 *
 * Server-only (under `methods/`, so the client build stubs it out).
 *
 * This is the inverse of `./bulk-import-csv.ts`. The importer's saver writes a
 * person plus an address (in a sibling resource, linked through
 * `person-shared-data`) plus a partner relationship; the exporter's source walks that
 * same graph backwards and flattens each person into one row. Because both sides
 * share {@link personCsvSchema}'s column list, a file exported here re-imports
 * cleanly.
 */

import { createCsvSerializer } from '@rambleraptor/homestead-core/server/bulk-export/csv';
import type {
  BulkExportSource,
  BulkExportContext,
} from '@rambleraptor/homestead-core/resources/bulk-export/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { ADDRESSES, PEOPLE, PERSON_RELATIONSHIPS, PERSON_SHARED_DATA } from '../resources';
import type { PersonRelationship } from '../types';
import { relativesFor } from '../utils/relationships';
import { personCsvSchema, type PersonCsvData } from './bulk-import-csv';

/** Columns, in the import template's order — so export ⇄ import round-trips. */
const columns = [
  ...personCsvSchema.requiredFields,
  ...personCsvSchema.optionalFields,
].map((field) => ({ name: field.name, description: field.description }));

interface PersonRecord {
  id: string;
  name: string;
}
interface AddressRecord {
  id: string;
  line1?: string;
  wifi_network?: string;
  wifi_password?: string;
}
interface SharedDataRecord {
  id: string;
  person_a: string;
  person_b?: string;
  address_id?: string;
}

/**
 * Flatten every person into a row: their name, the address hanging off their
 * shared-data record, and their partner's name (from their partner
 * relationship). One list per collection, joined in memory — the same
 * collections the importer wrote.
 */
export const source: BulkExportSource<PersonCsvData> = async ({
  ctx,
  filter,
  options,
}: {
  ctx: BulkExportContext;
  filter?: string;
  options?: Record<string, boolean>;
}) => {
  const hs = serverClient(ctx.auth.token);
  // `people` is the rows to output (filtered — a selection arrives as an
  // `id in [...]` filter). `allPeople` is fetched unfiltered purely to resolve
  // partner names, since a selected person's partner may be outside the filter.
  const [people, allPeople, shared, addresses, relationships] = await Promise.all([
    hs.collection<PersonRecord>(PEOPLE).listAll(filter ? { filter } : undefined),
    filter
      ? hs.collection<PersonRecord>(PEOPLE).listAll()
      : Promise.resolve(null),
    hs.collection<SharedDataRecord>(PERSON_SHARED_DATA).listAll(),
    hs.collection<AddressRecord>(ADDRESSES).listAll(),
    hs.collection<PersonRelationship>(PERSON_RELATIONSHIPS).listAll(),
  ]);

  const addressById = new Map(addresses.map((a) => [a.id, a]));
  // Names resolve against everyone (the unfiltered list when a filter is set,
  // otherwise the same list we're outputting).
  const nameById = new Map((allPeople ?? people).map((p) => [p.id, p.name]));
  // Every shared-data record each person appears in, from either side.
  const linksByPerson = new Map<string, SharedDataRecord[]>();
  for (const link of shared) {
    for (const id of [link.person_a, link.person_b]) {
      if (!id) continue;
      const list = linksByPerson.get(id) ?? [];
      list.push(link);
      linksByPerson.set(id, list);
    }
  }

  // Each output person paired with the address hanging off their shared-data.
  const withAddress = people.map((person) => {
    const links = linksByPerson.get(person.id) ?? [];
    const addressId = links.find((l) => l.address_id)?.address_id;
    return { person, links, addressId, address: addressId ? addressById.get(addressId) : undefined };
  });

  if (options?.combine_households) {
    // One row per household — people who share an address_id — computed *within
    // the output set*: an unticked partner is not pulled in. People with no
    // address are their own household.
    const groups = new Map<string, typeof withAddress>();
    const order: string[] = [];
    for (const entry of withAddress) {
      const key = entry.addressId ?? `solo:${entry.person.id}`;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(entry);
    }
    return order.map((key) => {
      const members = groups.get(key)!;
      const address = members[0].address;
      return {
        name: members.map((m) => m.person.name).join(' & '),
        address: address?.line1 || undefined,
        wifi_network: address?.wifi_network || undefined,
        wifi_password: address?.wifi_password || undefined,
        // The household is one row now, so a partner column would be redundant.
        partner_name: undefined,
      };
    });
  }

  return withAddress.map(({ person, address }) => ({
    name: person.name,
    address: address?.line1 || undefined,
    wifi_network: address?.wifi_network || undefined,
    wifi_password: address?.wifi_password || undefined,
    partner_name: relativesFor(person.id, relationships, nameById).partner?.name,
  }));
};

export default createCsvSerializer<PersonCsvData>(columns);
