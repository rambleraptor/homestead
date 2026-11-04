/**
 * The household documents worth having at hand — appliance manuals, warranties,
 * the homeowners policy, the property-tax statement.
 *
 * A read-only view over the Documents app: it reuses the same list query and
 * row component, then narrows to the Home doc types (see `homeDocTypes`).
 * Uploading and reading still happen in Documents; this is the shelf you pull
 * them off of. Rows are grouped by type so a manual doesn't hide among tax
 * statements.
 *
 * Renders as a *section* — `HomePage` owns the page title, so this contributes
 * only its own heading and rows.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useDocuments } from '../../documents/hooks/useDocuments';
import { DocumentListItem } from '../../documents/components/DocumentListItem';
import { getDocType } from '../../documents/doc-types/registry';
import type { Document } from '../../documents/types';
import { HOME_DOC_TYPE_IDS, isHomeDocument } from '../homeDocTypes';

/** A type heading plus the documents matched to it, in the allow-list order. */
interface HomeGroup {
  id: string;
  label: string;
  documents: Document[];
}

/**
 * Bucket the home documents by their matched type, preserving
 * `HOME_DOC_TYPE_IDS` order and dropping types with nothing to show. Input is
 * already newest-first (from `useDocuments`), so each group's rows are too.
 */
function groupByType(documents: Document[]): HomeGroup[] {
  return HOME_DOC_TYPE_IDS.map((id) => ({
    id,
    label: getDocType(id)?.label ?? id,
    documents: documents.filter((doc) => doc.metadata?.doc_type === id),
  })).filter((group) => group.documents.length > 0);
}

export function HomeDocuments() {
  const { data: documents, isLoading, isError, error, refetch } = useDocuments();

  const groups = useMemo(
    () => groupByType((documents ?? []).filter(isHomeDocument)),
    [documents],
  );
  const total = useMemo(
    () => groups.reduce((sum, group) => sum + group.documents.length, 0),
    [groups],
  );

  return (
    <div className="space-y-6" data-testid="home-documents">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Documents
        </h2>
        <Link
          to="/documents"
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-surface-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          data-testid="home-documents-upload-link"
        >
          <FileText className="h-4 w-4" />
          Add a document
        </Link>
      </div>

      {isLoading && (
        <SkeletonList
          rows={4}
          showLeading
          label="Loading documents"
          data-testid="home-documents-loading"
        />
      )}

      {isError && (
        <QueryError
          compact
          error={error}
          onRetry={() => void refetch()}
          title="Couldn’t load documents"
          data-testid="home-documents-error"
        />
      )}

      {documents && total === 0 && (
        <EmptyState
          compact
          icon={FileText}
          title="No home documents yet"
          description={
            <>
              Upload a manual, warranty, insurance policy, or property-tax
              statement in{' '}
              <Link
                to="/documents"
                className="text-accent-terracotta hover:text-accent-terracotta-hover hover:underline"
              >
                Documents
              </Link>{' '}
              and it’ll show up here once it’s read.
            </>
          }
          data-testid="home-documents-empty"
        />
      )}

      {groups.map((group) => (
        <section key={group.id} data-testid={`home-documents-group-${group.id}`}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {group.label}
          </h3>
          <div className="space-y-2">
            {group.documents.map((doc) => (
              <DocumentListItem key={doc.id} document={doc} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
