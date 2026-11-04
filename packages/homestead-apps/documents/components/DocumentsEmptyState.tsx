/**
 * What the documents index shows when it has no rows to show.
 *
 * There are four separate reasons the list can be empty and they want four
 * different answers, but the page used to give two: a proper illustrated state
 * for a brand-new library, and one muted grey sentence — "No documents to
 * show." — for everything else. A collection you have just created is the case
 * that suffered most: it is empty *because* nothing has been filed in it yet,
 * which is a thing the reader has to be told how to do, and instead they got a
 * dead end.
 *
 * So each reason gets its title, its explanation, and the action that resolves
 * it, in one shared shell so the four read as one family rather than four
 * screens.
 */

import type { ReactNode } from 'react';
import { FolderCheck, FolderOpen, Inbox, SearchX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';

export type EmptyReason =
  /** The household has uploaded nothing at all. */
  | 'library'
  /** Filters are active and match nothing in scope. */
  | 'filters'
  /** A collection is in scope and nothing is filed in it. */
  | 'collection'
  /** "Unfiled" is in scope and every document belongs to a collection. */
  | 'unfiled';

interface DocumentsEmptyStateProps {
  reason: EmptyReason;
  /** The collection in scope, for the `collection` reason's copy. */
  collectionName?: string;
  /** Clear every active filter — the `filters` reason's action. */
  onClearFilters?: () => void;
  /** Drop back to "All documents" — the two folder-scoped reasons' action. */
  onShowAll?: () => void;
}

interface EmptyCopy {
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  action?: { label: string; onClick?: () => void };
}

function copyFor({
  reason,
  collectionName,
  onClearFilters,
  onShowAll,
}: DocumentsEmptyStateProps): EmptyCopy {
  switch (reason) {
    case 'library':
      return {
        icon: Inbox,
        title: 'No documents yet',
        body: (
          <>
            Drop a PDF or photo above — tax forms, receipts, insurance cards — and
            we&rsquo;ll read and file it for you.
          </>
        ),
      };
    case 'filters':
      return {
        icon: SearchX,
        title: 'No documents match your filters',
        body: <>Try a broader search, or clear the filters to see everything in view.</>,
        action: { label: 'Clear filters', onClick: onClearFilters },
      };
    case 'collection':
      return {
        icon: FolderOpen,
        title: collectionName
          ? `Nothing filed in ${collectionName} yet`
          : 'Nothing filed here yet',
        body: (
          <>
            Open a document, choose <span className="font-medium">Edit</span>, and tick
            this collection to file it here.
          </>
        ),
        action: { label: 'View all documents', onClick: onShowAll },
      };
    case 'unfiled':
      return {
        icon: FolderCheck,
        title: 'Everything is filed',
        body: <>Every document belongs to at least one collection.</>,
        action: { label: 'View all documents', onClick: onShowAll },
      };
  }
}

export function DocumentsEmptyState(props: DocumentsEmptyStateProps) {
  const { reason } = props;
  const { icon, title, body, action } = copyFor(props);

  return (
    // `documents-empty` predates the other three states and is what the e2e
    // suite waits on for a fresh account; the rest share `documents-no-matches`
    // for the same reason, and separate by `data-empty-reason` — which the
    // shared EmptyState has no slot for, hence this wrapper carrying both.
    <div
      data-testid={reason === 'library' ? 'documents-empty' : 'documents-no-matches'}
      data-empty-reason={reason}
    >
      <EmptyState
        icon={icon}
        title={title}
        description={body}
        action={
          action?.onClick
            ? { label: action.label, onClick: action.onClick, testId: 'documents-empty-action' }
            : undefined
        }
        data-testid={`documents-empty-${reason}`}
      />
    </div>
  );
}
