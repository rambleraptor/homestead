/**
 * `documents/{id}:link` — run the document's doc-type `post_classify` hook now.
 *
 * Classify runs the hook itself; this is for a type a person set (or fields
 * they filled in) through the edit form, which is a plain PATCH and so never
 * reached the hook. The SPA calls it after saving a matched document that has
 * no `linked_resource` yet. A no-op when there's nothing to do, so it's safe
 * to call more than once. See `./post-classify`.
 */

import type { CustomMethodHandler } from '@rambleraptor/homestead-core/resources/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { DOCUMENTS } from '../resources';
import { runPostClassify } from './post-classify';
import type { Document } from '../types';

const handler: CustomMethodHandler = async ({ id, auth }) => {
  if (!id) {
    return Response.json(
      { error: 'Bad request', message: 'link is addressed on a single document' },
      { status: 400 },
    );
  }

  let doc: Document;
  try {
    doc = await serverClient(auth.token).collection<Document>(DOCUMENTS).get(id);
  } catch {
    return Response.json(
      { error: 'Not found', message: `document ${id} not found` },
      { status: 404 },
    );
  }

  if (doc.linked_resource) {
    return Response.json({ linked_resource: doc.linked_resource, created: false });
  }

  try {
    const linked = await runPostClassify(doc, auth);
    return Response.json({ linked_resource: linked ?? null, created: Boolean(linked) });
  } catch (err) {
    console.error(`[documents] link failed for ${id} (${doc.metadata?.doc_type})`, err);
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        error: 'Link failed',
        message: `Saved, but couldn't create the linked record: ${detail}`,
      },
      { status: 500 },
    );
  }
};

export default handler;
