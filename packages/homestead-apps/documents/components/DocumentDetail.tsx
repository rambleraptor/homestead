/**
 * Document detail: the file itself previewed inline alongside everything known
 * about it, plus the actions that act on it — edit its details by hand, re-read
 * it with AI, download the original, split it, or delete it.
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Loader2,
  Pencil,
  RefreshCw,
  Scissors,
  Trash2,
} from 'lucide-react';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { AppIcon } from '@rambleraptor/homestead-core/apps/lazy';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import {
  Skeleton,
  SkeletonRegion,
} from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { SectionCard } from '@rambleraptor/homestead-core/shared/components/SectionCard';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { getDocType } from '../doc-types/registry';
import { categoryLabel, categoryTone, documentCategory, OTHER_CATEGORY } from '../categories';
import { useDocument } from '../hooks/useDocument';
import { useJustParsed } from '../hooks/useJustParsed';
import { useClassifyDocument } from '../hooks/useUploadDocument';
import { useSplitDocument } from '../hooks/useSplitDocument';
import { useDeleteDocument, useUpdateDocument } from '../hooks/useUpdateDocument';
import { useDownloadDocument } from '../hooks/useDownloadDocument';
import { ConfidenceMeter } from './ConfidenceMeter';
import { DocTypeCombobox } from './DocTypeCombobox';
import { DocumentLabels } from './DocumentLabels';
import { DocumentOrigin } from './DocumentOrigin';
import { DocumentMetadata } from './DocumentMetadata';
import { DocumentEditForm } from './DocumentEditForm';
import { DocumentStatusBadge } from './DocumentStatusBadge';
import { DocumentEncryptionBadge } from './DocumentEncryptionBadge';
import { DocumentViewer } from './DocumentViewer';
import type { Document } from '../types';

interface DocumentDetailProps {
  documentId: string;
}

export function DocumentDetail({ documentId }: DocumentDetailProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: doc, isLoading, isError, error, refetch } = useDocument(documentId);
  // Before the early returns below: hooks can't be called conditionally, and a
  // document opened while it's still reading will resolve on this page.
  const revealing = useJustParsed(doc?.parse_status ?? 'pending');
  const update = useUpdateDocument();
  const remove = useDeleteDocument();
  const classify = useClassifyDocument();
  const split = useSplitDocument();
  const download = useDownloadDocument();

  const handleSave = async (patch: Partial<Document>) => {
    try {
      await update.mutateAsync({ id: documentId, patch });
      setIsEditing(false);
      toast.success('Document updated');
    } catch (err) {
      toast.error(err);
    }
  };

  /**
   * Deletion stays behind a confirmation rather than an undo toast. The undo
   * pattern needs a record that can be *recreated* — a document owns its file
   * bytes, and a post-classify hook may have written a record pointing back at
   * this id (see `medical-receipt.server.ts`), so there is no honest restore.
   */
  const handleDelete = async () => {
    try {
      await remove.mutateAsync(documentId);
      toast.success('Document deleted');
      navigate('/documents');
    } catch (err) {
      toast.error(err);
    }
  };

  const backLink = (
    <Link
      to="/documents"
      className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-brand-slate"
      data-testid="document-detail-back"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to documents
    </Link>
  );

  if (isLoading) {
    // Stands in for the page that is coming rather than for the fact of
    // waiting: the back link, the title block, then the two-column body with
    // the preview on the left and the detail cards on the right. Holding that
    // frame means the header and the buttons don't pop into existence under a
    // reader who is already reaching for them.
    return (
      <SkeletonRegion
        label="Loading document"
        className="space-y-6"
        data-testid="document-detail-loading"
      >
        <Skeleton className="h-5 w-40" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="mt-2 h-5 w-40" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-20 rounded-lg" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-32 rounded-full" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          <Skeleton className="h-[60vh] w-full rounded-2xl" />
          <div className="space-y-6">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </div>
      </SkeletonRegion>
    );
  }

  if (isError || !doc) {
    return (
      <div className="space-y-4">
        {backLink}
        <QueryError
          error={isError ? error : 'It may have been deleted, or the link is wrong.'}
          onRetry={isError ? () => void refetch() : undefined}
          title={isError ? 'Failed to load this document' : 'Document not found'}
          data-testid="document-detail-error"
        />
      </div>
    );
  }

  const status = doc.parse_status ?? 'pending';
  const docType = doc.metadata?.doc_type ? getDocType(doc.metadata.doc_type) : undefined;
  const busy = classify.isPending || status === 'pending';
  const category = documentCategory(doc);
  const tone = categoryTone(category);

  return (
    <div className="space-y-6" data-testid="document-detail">
      {backLink}

      <PageHeader
        title={doc.title || 'Untitled document'}
        subtitle={
          <span data-testid="document-type">
            {docType?.label ?? 'Unrecognised document'}
          </span>
        }
        actions={
          !isEditing && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => download.mutate(doc)}
                disabled={download.isPending}
                data-testid="document-download"
              >
                {download.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download
              </Button>
              <Button
                variant="secondary"
                onClick={() => setIsEditing(true)}
                data-testid="document-edit"
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </div>
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <DocumentStatusBadge status={status} />
        {/* The category the matched type belongs to — the same colour the
            document wears in the list, so the two read as one thing. */}
        {category !== OTHER_CATEGORY && (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone.surface} ${
              revealing ? 'animate-reveal-pop' : ''
            }`}
            data-testid="document-category"
          >
            {docType && <AppIcon icon={docType.icon} className="h-3.5 w-3.5" />}
            {categoryLabel(category)}
          </span>
        )}
        {typeof doc.file_encrypted === 'boolean' && (
          <DocumentEncryptionBadge encrypted={doc.file_encrypted} />
        )}
        {typeof doc.confidence === 'number' && status === 'parsed' && (
          <ConfidenceMeter value={doc.confidence} />
        )}
      </div>

      {!isEditing && (
        <>
          <DocumentLabels document={doc} />
          <DocumentOrigin document={doc} />
        </>
      )}

      {isEditing ? (
        <div className="rounded-2xl border border-gray-100 bg-surface-white p-5 shadow-sm">
          <DocumentEditForm
            document={doc}
            isSaving={update.isPending}
            onCancel={() => setIsEditing(false)}
            onSubmit={handleSave}
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          {/* Left: the file itself, kept in view while the details scroll. */}
          <div className="lg:sticky lg:top-6">
            <DocumentViewer document={doc} />
          </div>

          {/* Right: parsed fields, extracted text, and the management tools. */}
          <div className="space-y-6">
            <SectionCard title="Details">
              {status === 'pending' ? (
                <p className="text-sm text-text-muted">Still reading this document…</p>
              ) : (
                <DocumentMetadata metadata={doc.metadata} />
              )}
            </SectionCard>

            {(doc.file_text ?? doc.full_text) && (
              <SectionCard title="Extracted text">
                <pre
                  className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-bg-pearl p-3 text-xs text-brand-slate"
                  data-testid="document-full-text"
                >
                  {doc.file_text ?? doc.full_text}
                </pre>
              </SectionCard>
            )}

            {/* overflow-visible: the type picker's panel opens past the card's
                edge, and SectionCard clips by default. */}
            <SectionCard title="Manage" className="overflow-visible">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => classify.mutate({ id: documentId })}
                  disabled={busy}
                  data-testid="document-reclassify"
                >
                  <RefreshCw className="h-4 w-4" />
                  Read again with AI
                </Button>

                {/* Force a type: skips the AI's guess and extracts that type's
                    fields directly — for when classification keeps getting it
                    wrong. Holds no selection of its own; picking a type is the
                    action. */}
                <DocTypeCombobox
                  value=""
                  onSelect={(docType) => classify.mutate({ id: documentId, docType })}
                  placeholder="Classify as…"
                  disabled={busy}
                  aria-label="Classify as a specific document type"
                  title="Force this document to a specific type, then extract its fields"
                  data-testid="document-force-type"
                />

                {doc.mime_type === 'application/pdf' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => split.mutate(documentId)}
                    disabled={split.isPending || status === 'pending'}
                    data-testid="document-split"
                    title="Split this PDF into one document per form (e.g. a tax return)"
                  >
                    <Scissors className="h-4 w-4" />
                    Split into forms
                  </Button>
                )}

                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  disabled={remove.isPending}
                  data-testid="document-delete"
                  className="ml-auto"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void handleDelete();
        }}
        title="Delete document"
        message="Delete this document? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={remove.isPending}
      />
    </div>
  );
}
