/**
 * Manual edits to a document: save the fields a human changed, or delete it.
 *
 * The engine applies a shallow top-level merge on PATCH, so sending a whole
 * `metadata` object replaces it outright — switching doc types can't leave a
 * previous type's variant fields behind.
 */

import { useMutation } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { DOCUMENTS } from '../resources';
import { invalidateDocuments } from './useDocuments';
import type { Document } from '../types';

export function useUpdateDocument() {
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Document>;
    }): Promise<Document> => {
      const doc = await aepbase.update<Document>(DOCUMENTS, id, patch);
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
