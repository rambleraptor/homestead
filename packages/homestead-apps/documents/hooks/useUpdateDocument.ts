/**
 * Manual edits to a document: save the fields a human changed, or delete it.
 *
 * The engine deep-merges an object field on PATCH, so a caller replacing
 * `metadata` sends it through `replaceMetadata` — otherwise switching doc types
 * would leave the previous type's variant fields behind.
 *
 * A save that leaves the document matched to a type with a `post_classify`
 * hook (and no `linked_resource` yet) then calls `:link`, so a type or amount a
 * person filled in by hand reaches the app it belongs in — a charitable
 * receipt, an HSA receipt — exactly as an AI classification would.
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { DOCUMENTS } from '../resources';
import { UNKNOWN_DOC_TYPE } from '../doc-types/docType';
import { getDocType } from '../doc-types/registry';
import { invalidateDocuments } from './useDocuments';
import type { Document } from '../types';

/** Whether a saved document should have its post-classify record created now. */
export function needsLink(doc: Document): boolean {
  if (doc.linked_resource) return false;
  const docTypeId = doc.metadata?.doc_type;
  if (!docTypeId || docTypeId === UNKNOWN_DOC_TYPE) return false;
  return Boolean(getDocType(docTypeId)?.post_classify);
}

export function useUpdateDocument() {
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Document>;
    }): Promise<Document> => {
      let doc = await aepbase.update<Document>(DOCUMENTS, id, patch);
      if (needsLink(doc)) {
        const { linked_resource } = await aepbase.customMethod<{
          linked_resource: string | null;
        }>(DOCUMENTS, 'link', undefined, { id });
        if (linked_resource) doc = { ...doc, linked_resource };
      }
      await invalidateDocuments();
      return doc;
    },
  });
}

export function useDeleteDocument() {
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await aepbase.remove(DOCUMENTS, id);
      await invalidateDocuments();
    },
  });
}
