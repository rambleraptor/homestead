/**
 * Backfill `document.people` from the names each document already extracted.
 *
 * The `people` link is new; existing documents have it empty even though their
 * doc-type metadata already names people (a receipt's patient, a W-2's
 * employee). This seeds the stored link once from that derived data, so a
 * person's detail page isn't empty on day one — resolving each extracted name to
 * a directory id exactly as `classify` now does for new uploads.
 *
 * Idempotent: a document that already carries a non-empty `people` list is left
 * untouched (a resumed or re-run pass never clobbers a value classify or a human
 * has since set), and a document whose names resolve to nobody is skipped.
 */

import type { MigrationHandler } from '@rambleraptor/homestead-core/apps/migrations';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { DOCUMENTS } from '../resources';
import { PEOPLE } from '../../people/resources';
import { resolveDocumentPersonIds } from '../personLinks';
import type { Document } from '../types';
import type { Person } from '../../people/types';

interface PersonRow {
  id: string;
  name: string;
  aliases?: string[];
}

const migrate: MigrationHandler = async ({ token, log }) => {
  const client = serverClient(token);
  const documents = client.collection<Document>(DOCUMENTS);

  const peopleRows = await client.collection<PersonRow>(PEOPLE).listAll();
  // matchPersonByName only reads `name` and `aliases`; fill the rest minimally.
  const directory = peopleRows.map(
    (row): Person => ({
      id: row.id,
      name: row.name,
      aliases: row.aliases ?? [],
      households: [],
      parents: [],
      children: [],
      siblings: [],
      created_by: '',
      created: '',
      updated: '',
    }),
  );

  const docs = await documents.listAll();
  let patched = 0;
  for (const doc of docs) {
    if (doc.people && doc.people.length > 0) continue; // idempotent guard
    const ids = resolveDocumentPersonIds(doc, directory);
    if (ids.length === 0) continue;
    await documents.record(doc.id).update({ people: ids });
    if (++patched % 50 === 0) await log(`patched ${patched}…`);
  }

  return { scanned: docs.length, people: directory.length, patched };
};

export default migrate;
