/**
 * Upload a document, then kick off classification.
 *
 * Two steps on purpose. The file is stored first via an ordinary multipart
 * create, so the upload is durable the moment it lands — if classification then
 * fails, times out, or the server restarts, the document is still there and can
 * be reclassified. The classify call returns a 202 immediately; the handler
 * PATCHes the record in the background and the list polls it to `parsed`.
 *
 * So this mutation resolves once the file is *stored*, not once it's parsed.
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { DOCUMENTS } from '../resources';
import { invalidateDocuments } from './useDocuments';
import type { Document } from '../types';

/** Strip the extension for a default title: "1099-int-2025.pdf" → "1099-int-2025". */
function titleFromFilename(name: string): string {
  return name.replace(/\.[^./]+$/, '') || name;
}

export function useUploadDocument() {
  return useMutation({
    mutationFn: async (file: File): Promise<Document> => {
      const userId = aepbase.getCurrentUser()?.id;
      const resource: Record<string, unknown> = {
        title: titleFromFilename(file.name),
        // Recorded now because `:download` serves everything as
        // application/octet-stream — the classify handler can't recover it later.
        mime_type: file.type,
        parse_status: 'pending',
      };
      if (userId) resource.created_by = `users/${userId}`;

      const formData = new FormData();
      formData.append('resource', JSON.stringify(resource));
      formData.append('file', file);

      const doc = await aepbase.create<Document>(DOCUMENTS, formData);
      await invalidateDocuments();

      // Fire-and-forget: the operation is observable in the (superuser-only)
      // Operations app, and the list polls parse_status. A failure here must not
      // fail the upload — the file is already stored.
      void aepbase
        .customMethod<{ id: string }>(DOCUMENTS, 'classify', undefined, { id: doc.id })
        .catch((error) => logger.error('Failed to start document classification', error));

      return doc;
    },
    onSuccess: () => logger.info('Document uploaded'),
  });
}

/**
 * Re-run classification on an existing document (e.g. after adding a doc type).
 *
 * Pass `docType` to *force* the type: classify then skips its pass-1 guess and
 * runs only field extraction for that type. Omit it to let the AI classify
 * ("Read again"). Either way the document goes back to `pending` while the
 * background parse runs.
 */
export function useClassifyDocument() {
  return useMutation({
    mutationFn: async ({ id, docType }: { id: string; docType?: string }) => {
      await aepbase.update<Document>(DOCUMENTS, id, { parse_status: 'pending' });
      await invalidateDocuments();
      const body = docType ? { doc_type: docType } : undefined;
      return aepbase.customMethod<{ id: string }>(DOCUMENTS, 'classify', body, { id });
    },
  });
}
