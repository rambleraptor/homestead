/**
 * `people-backfill-households` migration.
 *
 * Addresses used to hang off `person-shared-data` (one or two people): the
 * row's `address_id` was the primary address and any address whose
 * `shared_data_id` pointed back at it was an extra. Both now live on
 * `household` records, so each of those addresses becomes a household whose
 * members are the row's people, named after them ("Ann & Bob"). A group with
 * several addresses gets one household per address, named after both
 * ("Ann & Bob (9 Lake Rd)").
 *
 * The legacy rows are left in place; a later release drops them.
 *
 * Idempotent: a household with the same members and address already present
 * (from an earlier run, or made by hand) is skipped.
 *
 * Server-only: lives under `migrations/`, so vite stubs it out of the browser
 * bundle. Runs once at boot with a short-lived admin token.
 */

import type { MigrationHandler } from '@rambleraptor/homestead-core/apps/migrations';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { ADDRESSES, HOUSEHOLDS, PEOPLE, PERSON_SHARED_DATA } from '../resources';
import type { Household } from '../types';
import { householdNameFor, memberIds } from '../utils/households';
import {
  addressFields,
  householdKey,
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
    hs.collection<{ id: string; name: string }>(PEOPLE).listAll(),
    hs.collection<Household>(HOUSEHOLDS).listAll(),
  ]);
  const households = hs.collection<Household>(HOUSEHOLDS);

  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const addressById = new Map(addresses.map((a) => [a.id, a]));
  const personIds = new Set(nameById.keys());
  const seen = new Set(existing.map((h) => householdKey(memberIds(h), h)));

  let created = 0;
  let skipped = 0;
  for (const sd of shared) {
    // Only people who still exist; a dangling id would fail the reference check.
    const members = sharedDataMembers(sd, personIds);
    const group = sharedDataAddresses(sd, addresses, addressById);
    if (members.length === 0 || group.length === 0) {
      skipped++;
      continue;
    }

    const names = householdNameFor(members.map((id) => nameById.get(id)!));
    for (const address of group) {
      const fields = addressFields(address);
      const key = householdKey(members, fields);
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      const name = group.length > 1 && fields.line1 ? `${names} (${fields.line1})` : names;
      await households.create({
        name,
        members,
        ...fields,
        created_by: sd.created_by || address.created_by || undefined,
      });
      seen.add(key);
      if (++created % 50 === 0) await log(`created ${created}…`);
    }
  }

  return { scanned: shared.length, created, skipped };
};

export default migrate;
