/**
 * Split a bundle PDF (e.g. a tax return) into its constituent documents.
 *
 * Two entry points, both leaving the ordinary single-document flow untouched:
 *   - {@link useUploadBundle} uploads a new PDF and fires `split` instead of
 *     `classify` — the file is stored durably first, then split in the
 *     background (202), exactly mirroring {@link useUploadDocument}'s shape.
 *   - {@link useSplitDocument} splits a PDF that's already uploaded.
 *
 * The split method creates one child `documents` record per form and kicks off
 * the normal `classify` on each, so every piece is read exactly as a standalone
 * upload would be.
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { DOCUMENTS } from '../resources';
import { invalidateDocuments } from './useDocuments';
import type { Document } from '../types';

/** Strip the extension for a default title: "return-2025.pdf" → "return-2025". */
function titleFromFilename(name: string): string {
  return name.replace(/\.[^./]+$/, '') || name;
}

/**
 * Upload a PDF bundle and split it into its constituent documents. Resolves
 * once the file is *stored*; the split (and each child's classify) runs in the
 * background, and the list polls the pieces in as they're read.
 */
export function useUploadBundle() {
  return useMutation({
    mutationFn: async (file: File): Promise<Document> => {
      const userId = aepbase.getCurrentUser()?.id;
      const resource: Record<string, unknown> = {
        title: titleFromFilename(file.name),
        mime_type: file.type,
        parse_status: 'pending',
      };
      if (userId) resource.created_by = `users/${userId}`;

      const formData = new FormData();
      formData.append('resource', JSON.stringify(resource));
      formData.append('file', file);

      const doc = await aepbase.create<Document>(DOCUMENTS, formData);
      await invalidateDocuments();

      // Fire-and-forget: a failure here must not fail the upload — the file is
      // already stored and can be split by hand from its detail page.
      void aepbase
        .customMethod<{ id: string }>(DOCUMENTS, 'split', undefined, { id: doc.id })
        .catch((error) => logger.error('Failed to start document split', error));

      return doc;
    },
    onSuccess: () => logger.info('Bundle uploaded'),
  });
}

/** Split an already-uploaded PDF document into its constituent documents. */
export function useSplitDocument() {
  return useMutation({
    mutationFn: async (id: string) => {
      // Flip to pending so the list polls while the split runs and its new
      // children arrive; the handler resets it to a terminal state when done.
      await aepbase.update<Document>(DOCUMENTS, id, { parse_status: 'pending' });
      await invalidateDocuments();
      return aepbase.customMethod<{ id: string }>(DOCUMENTS, 'split', undefined, { id });
    },
  });
}
