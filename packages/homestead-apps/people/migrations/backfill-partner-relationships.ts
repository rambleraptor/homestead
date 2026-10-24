/**
 * `people-backfill-partner-relationships` migration.
 *
 * Partnership used to be implied by two people sharing one
 * `person-shared-data` record (`person_a` + `person_b`). It now lives in
 * `person-relationship` rows, so each existing pairing gets a `partner` row.
 * The shared-data record itself is left alone: it still groups the pair's
 * addresses.
 *
 * Idempotent: a pair that already has a partner row is skipped.
 *
 * Server-only: lives under `migrations/`, so vite stubs it out of the browser
 * bundle. Runs once at boot with a short-lived admin token.
 */

import type { MigrationHandler } from '@rambleraptor/homestead-core/apps/migrations';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { PERSON_RELATIONSHIPS, PERSON_SHARED_DATA } from '../resources';
import type { PersonRelationship } from '../types';
import { canonicalLink, linkKey } from '../utils/relationships';

/** The legacy `person-shared-data` row (the resource is being retired). */
interface PersonSharedData {
  id: string;
  person_a: string;
  person_b?: string;
  created_by?: string;
}

const migrate: MigrationHandler = async ({ token, log }) => {
  const hs = serverClient(token);
  const shared = await hs.collection<PersonSharedData>(PERSON_SHARED_DATA).listAll();
  const relationships = hs.collection<PersonRelationship>(PERSON_RELATIONSHIPS);
  const existing = new Set((await relationships.listAll()).map(linkKey));

  let created = 0;
  let skipped = 0;
  for (const sd of shared) {
    if (!sd.person_a || !sd.person_b || sd.person_a === sd.person_b) {
      skipped++;
      continue;
    }
    const link = canonicalLink('partner', sd.person_a, sd.person_b);
    const key = linkKey(link);
    if (existing.has(key)) {
      skipped++;
      continue;
    }
    await relationships.create({ ...link, created_by: sd.created_by || undefined });
    existing.add(key);
    if (++created % 50 === 0) await log(`created ${created}…`);
  }

  return { scanned: shared.length, created, skipped };
};

export default migrate;
