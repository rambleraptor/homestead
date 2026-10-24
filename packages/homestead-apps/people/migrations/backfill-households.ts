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
import { personIdOf } from '../utils/relationships';

/** The legacy rows this migration reads (both resources are being retired). */
interface LegacySharedData {
  id: string;
  person_a: string;
  person_b?: string;
  address_id?: string;
  created_by?: string;
}

interface LegacyAddress {
  id: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  wifi_network?: string;
  wifi_password?: string;
  shared_data_id?: string;
  created_by?: string;
}

const ADDRESS_FIELDS = [
  'line1',
  'line2',
  'city',
  'state',
  'postal_code',
  'country',
  'wifi_network',
  'wifi_password',
] as const;

function signature(members: string[], fields: Partial<Record<(typeof ADDRESS_FIELDS)[number], string>>) {
  const address = ADDRESS_FIELDS.map((f) => fields[f]?.trim() ?? '').join('|');
  return `${[...members].sort().join(',')}#${address}`;
}

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
  const seen = new Set(existing.map((h) => signature(memberIds(h), h)));

  let created = 0;
  let skipped = 0;
  for (const sd of shared) {
    // Only people who still exist; a dangling id would fail the reference check.
    const members = [...new Set([sd.person_a, sd.person_b].filter(Boolean).map((id) => personIdOf(id!)))]
      .filter((id) => nameById.has(id));
    const primary = sd.address_id ? addressById.get(sd.address_id) : undefined;
    const extras = addresses.filter((a) => a.shared_data_id === sd.id && a.id !== sd.address_id);
    const group = primary ? [primary, ...extras] : extras;
    if (members.length === 0 || group.length === 0) {
      skipped++;
      continue;
    }

    const names = householdNameFor(members.map((id) => nameById.get(id)!));
    for (const address of group) {
      const fields = Object.fromEntries(
        ADDRESS_FIELDS.map((f) => [f, address[f]?.trim() || undefined]),
      ) as Partial<Record<(typeof ADDRESS_FIELDS)[number], string>>;
      const key = signature(members, fields);
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
