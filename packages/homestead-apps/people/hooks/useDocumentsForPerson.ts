/**
 * The documents linked to one person, newest first.
 *
 * Reuses the documents app's `useDocuments` query (so the list is shared and
 * cached with the Documents page) and keeps the ones whose stored `people` link
 * contains this person's id. Documents are ACL-private, so this only ever
 * surfaces documents the current user can already see.
 */

import { useMemo } from 'react';
import { useDocuments } from '../../documents/hooks/useDocuments';
import type { Document } from '../../documents/types';

export interface DocumentsForPerson {
  documents: Document[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

export function useDocumentsForPerson(personId: string): DocumentsForPerson {
  const { data, isLoading, isError, error, refetch } = useDocuments();
  const documents = useMemo(
    () => (data ?? []).filter((doc) => (doc.people ?? []).includes(personId)),
    [data, personId],
  );
  return { documents, isLoading, isError, error, refetch: () => void refetch() };
}
