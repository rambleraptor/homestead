/**
 * Charitable receipts gained a `source` (Self or DAF). Every receipt recorded
 * before then was entered as a gift the donor paid directly, so stamp each one
 * `Self` — the filter and the totals then see a value on every row rather than
 * inferring one from its absence.
 */

import type { MigrationHandler } from '@rambleraptor/homestead-core/apps/migrations';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { CHARITABLE_RECEIPTS } from '../charitable/resources';

interface CharitableRow {
  id: string;
  source?: string;
}

const migrate: MigrationHandler = async ({ token, log }) => {
  const collection = serverClient(token).collection<CharitableRow>(CHARITABLE_RECEIPTS);
  const receipts = await collection.listAll();
  let patched = 0;
  for (const receipt of receipts) {
    if (receipt.source) continue; // idempotent guard
    await collection.record(receipt.id).update({ source: 'Self' });
    if (++patched % 50 === 0) await log(`patched ${patched}…`);
  }
  return { scanned: receipts.length, patched };
};

export default migrate;
