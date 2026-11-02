/**
 * Run a document's doc-type `post_classify` hook — the step that mirrors a
 * classified document into another app (a charitable receipt, an HSA receipt,
 * a recipe) — and record what it made as the document's `linked_resource`.
 *
 * Shared by the two ways a document gets its type: the AI (`:classify`) and a
 * person (the edit form, through `:link`). Before `:link` existed only the AI
 * path ran the hook, so a document someone typed by hand — or whose amount they
 * filled in after the AI missed it — never reached the app it belongs in.
 */

import type { CustomMethodAuth } from '@rambleraptor/homestead-core/resources/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { DOCUMENTS } from '../resources';
import { UNKNOWN_DOC_TYPE } from '../doc-types/docType';
import { getDocType } from '../doc-types/registry';
import type { Document } from '../types';

/**
 * The created resource's path, or undefined when there was nothing to do: no
 * matched type, a type without a hook, a hook that made nothing, or a document
 * that already carries a link (the idempotency guard — a re-run must not
 * create a second receipt). A failing hook throws; the caller decides whether
 * that's fatal.
 */
export async function runPostClassify(
  document: Document,
  auth: CustomMethodAuth,
): Promise<string | undefined> {
  if (document.linked_resource) return undefined;
  const metadata = document.metadata;
  const docTypeId = metadata?.doc_type;
  if (!docTypeId || docTypeId === UNKNOWN_DOC_TYPE) return undefined;
  const docType = getDocType(docTypeId);
  if (!docType?.post_classify) return undefined;

  const { default: hook } = await docType.post_classify();
  const result = await hook({ document, metadata, auth });
  if (!result?.linked_resource) return undefined;

  await serverClient(auth.token)
    .collection<Document>(DOCUMENTS)
    .record(document.id)
    .update({ linked_resource: result.linked_resource });
  return result.linked_resource;
}
