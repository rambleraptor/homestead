/**
 * People CSV export — serializer and the joining source.
 *
 * Server-only (under `methods/`, so the client build stubs it out).
 *
 * This is the inverse of `./bulk-import-csv.ts`. The importer's saver writes a
 * person, a partner relationship, and households grouping rows that share an
 * address; the exporter's source walks that same graph backwards and flattens
 * each person into one row. Because both sides share {@link personCsvSchema}'s
 * column list, a file exported here re-imports cleanly — members of one
 * household export the same address, so they land in one household again.
 */

import { createCsvSerializer } from '@rambleraptor/homestead-core/server/bulk-export/csv';
import type {
  BulkExportSource,
  BulkExportContext,
} from '@rambleraptor/homestead-core/resources/bulk-export/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { HOUSEHOLDS, PEOPLE, PERSON_RELATIONSHIPS } from '../resources';
import type { Household, PersonRelationship } from '../types';
import { relativesFor } from '../utils/relationships';
import { formatAddress, householdsFor } from '../utils/households';
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

/**
 * Flatten every person into a row: their name, their household's address and
 * WiFi, and their partner's name. A person in several households exports the
 * first by name (the CSV has one address column). One list per collection,
 * joined in memory — the same collections the importer wrote.
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
  const [people, allPeople, households, relationships] = await Promise.all([
    hs.collection<PersonRecord>(PEOPLE).listAll(filter ? { filter } : undefined),
    filter
      ? hs.collection<PersonRecord>(PEOPLE).listAll()
      : Promise.resolve(null),
    hs.collection<Household>(HOUSEHOLDS).listAll(),
    hs.collection<PersonRelationship>(PERSON_RELATIONSHIPS).listAll(),
  ]);

  // Names resolve against everyone (the unfiltered list when a filter is set,
  // otherwise the same list we're outputting).
  const nameById = new Map((allPeople ?? people).map((p) => [p.id, p.name]));

  const withHousehold = people.map((person) => ({
    person,
    household: householdsFor(person.id, households)[0],
  }));

  const addressColumns = (household?: Household) => ({
    address: formatAddress(household ?? {}) || undefined,
    wifi_network: household?.wifi_network || undefined,
    wifi_password: household?.wifi_password || undefined,
  });

  if (options?.combine_households) {
    // One row per household, computed *within the output set*: an unticked
    // member is not pulled in. People with no household are their own row.
    const groups = new Map<string, typeof withHousehold>();
    for (const entry of withHousehold) {
      const key = entry.household?.id ?? `solo:${entry.person.id}`;
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.values()].map((members) => ({
      name: members.map((m) => m.person.name).join(' & '),
      ...addressColumns(members[0].household),
      // The household is one row now, so a partner column would be redundant.
      partner_name: undefined,
    }));
  }

  return withHousehold.map(({ person, household }) => ({
    name: person.name,
    ...addressColumns(household),
    partner_name: relativesFor(person.id, relationships, nameById).partner?.name,
  }));
};

export default createCsvSerializer<PersonCsvData>(columns);
