/**
 * `people-backfill-stranded-addresses` migration.
 *
 * `people-backfill-households` turned each shared-data row's addresses into
 * households of that row's people. It skipped two kinds of address, which
 * would be lost when the legacy `address` resource is dropped:
 *
 * - addresses no shared-data row claims (no row's `address_id` names them and
 *   their own `shared_data_id` is empty or points at a missing row);
 * - addresses whose shared-data row has no people left (all deleted).
 *
 * Each becomes a household with no members, named after its first line, so it
 * shows up on the Households page for someone to assign or delete. An address
 * with every field blank carries nothing and is skipped.
 *
 * Idempotent: an address already present on any household (from an earlier
 * run, or entered by hand) is skipped.
 *
 * Server-only: lives under `migrations/`, so vite stubs it out of the browser
 * bundle. Runs once at boot with a short-lived admin token.
 */

import type { MigrationHandler } from '@rambleraptor/homestead-core/apps/migrations';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { ADDRESSES, HOUSEHOLDS, PEOPLE, PERSON_SHARED_DATA } from '../resources';
import type { Household } from '../types';
import { formatAddress } from '../utils/households';
import {
  addressFields,
  addressKey,
  sharedDataAddresses,
  sharedDataMembers,
  type LegacyAddress,
  type LegacySharedData,
} from './legacy-addresses';

const migrate: MigrationHandler = async ({ token, log }) => {
  const hs = serverClient(token);
  const [shared, addresses, people, existing] = await Promise.all([
    hs.collection<LegacySharedData>(PERSON_SHARED_DATA).listAll(),
    hs.collection<LegacyAddress>(ADDRESSES).listAll(),
    hs.collection<{ id: string }>(PEOPLE).listAll(),
    hs.collection<Household>(HOUSEHOLDS).listAll(),
  ]);
  const households = hs.collection<Household>(HOUSEHOLDS);

  const personIds = new Set(people.map((p) => p.id));
  const addressById = new Map(addresses.map((a) => [a.id, a]));

  // The addresses the first backfill turned into households: those on a row
  // with at least one surviving person.
  const covered = new Set<string>();
  for (const sd of shared) {
    if (sharedDataMembers(sd, personIds).length === 0) continue;
    for (const a of sharedDataAddresses(sd, addresses, addressById)) covered.add(a.id);
  }

  const seen = new Set(existing.map((h) => addressKey(h)));
  const blank = addressKey({});

  let created = 0;
  let skipped = 0;
  const stranded = addresses.filter((a) => !covered.has(a.id));
  for (const address of stranded) {
    const fields = addressFields(address);
    const key = addressKey(fields);
    if (key === blank || seen.has(key)) {
      skipped++;
      continue;
    }
    await households.create({
      name: fields.line1 || formatAddress(fields) || fields.wifi_network || 'Household',
      members: [],
      ...fields,
      created_by: address.created_by || undefined,
    });
    seen.add(key);
    if (++created % 50 === 0) await log(`created ${created}…`);
  }

  return { scanned: addresses.length, stranded: stranded.length, created, skipped };
};

export default migrate;
