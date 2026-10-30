/**
 * Documents home: drop a file to have it read, then browse and filter what came
 * back.
 */

import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, FileText } from 'lucide-react';
import { getAepErrorMessage } from '@rambleraptor/homestead-core/api/errorMessage';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { TickingCount } from '@rambleraptor/homestead-core/shared/components/TickingCount';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { useReducedMotion } from '@rambleraptor/homestead-core/shared/hooks/useReducedMotion';
import { useSharedFiles } from '@rambleraptor/homestead-core/shared/pwa/shareTarget';
import { useDocuments } from '../hooks/useDocuments';
import { useUploadDocument } from '../hooks/useUploadDocument';
import { useUploadBundle } from '../hooks/useSplitDocument';
import { RedactionEditor } from '../redaction/RedactionEditor';
import { useDeleteDocument } from '../hooks/useUpdateDocument';
import {
  useCollections,
  useSetDocumentCollections,
  toggleMembership,
} from '../hooks/useCollections';
import { usePeople } from '../../people/hooks/usePeople';
import { findDuplicateUploads } from '../duplicates';
import { HEIC_ACCEPT, toUploadable } from '../heic';
import { getDocType } from '../doc-types/registry';
import { DocumentListItem } from './DocumentListItem';
import { DocumentFilters } from './DocumentFilters';
import { DocumentDropzone } from './DocumentDropzone';
import { DuplicateUploadWarning } from './DuplicateUploadWarning';
import { DocumentsEmptyState, type EmptyReason } from './DocumentsEmptyState';
import { DocumentsSkeleton } from './DocumentsSkeleton';
import { PendingUploadRows, type PendingUpload } from './PendingUploadRows';
import { CollectionsBar, UNFILED, type CollectionSelection } from './CollectionsBar';
import type { Document } from '../types';
import {
  collectDocTypeFacets,
  collectPeople,
  collectTagFacets,
  EMPTY_FILTERS,
  filterDocuments,
  hasActiveFilters,
  type DocumentFilters as Filters,
} from '../filtering';

// HEIC is taken and converted to JPEG on the way up (see `heic.ts`).
const ACCEPT = `application/pdf,image/jpeg,image/png,image/webp,image/gif,${HEIC_ACCEPT}`;
/** The bundle-split path takes a PDF only — a form boundary needs pages to cut. */
const ACCEPT_PDF = 'application/pdf';

/**
 * The row cascade. Rows rise in sequence when the list is rebuilt — a re-sort,
 * a folder change, a facet change — so a reorder is something you watch happen
 * rather than a flash between two arrangements. Capped for the same reason the
 * metadata cascade is: past the cap the remaining rows share the last delay and
 * land together, which is fine, because by then the cascade has been read.
 */
const ROW_STAGGER_MS = 22;
const MAX_STAGGERED_ROWS = 12;

/**
 * How long a row's collapse runs before the mutation behind it is sent. Must
 * match `--animate-row-collapse` in globals.css — a JS timer and a CSS
 * animation agreeing by hand is fragile, but the alternative (waiting on
 * `animationend`) fails silently when the element is unmounted mid-flight,
 * which is exactly the case here.
 */
const ROW_EXIT_MS = 240;

type SortKey = 'newest' | 'oldest' | 'title' | 'type';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Name (A–Z)' },
  { value: 'type', label: 'Document type' },
];

function typeLabel(doc: Document): string {
  const id = doc.metadata?.doc_type;
  return (id ? getDocType(id)?.label : undefined) ?? 'Unrecognised document';
}

function sortDocuments(docs: Document[], sort: SortKey): Document[] {
  const copy = [...docs];
  switch (sort) {
    case 'newest':
      return copy.sort((a, b) => (b.create_time ?? '').localeCompare(a.create_time ?? ''));
    case 'oldest':
      return copy.sort((a, b) => (a.create_time ?? '').localeCompare(b.create_time ?? ''));
    case 'title':
      return copy.sort((a, b) =>
        (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' }),
      );
    case 'type':
      return copy.sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)));
  }
}

export function DocumentsHome() {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const redactInputRef = useRef<HTMLInputElement>(null);
  const bundleInputRef = useRef<HTMLInputElement>(null);
  const [redactTarget, setRedactTarget] = useState<File | null>(null);
  // Deletion is the one action here that a toast can't take back — the file
  // bytes are gone and a post-classify hook may hold this id — so it keeps a
  // confirmation. Everything else reports through toasts.
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>('newest');
  // Top-level folder scope: null = all, 'unfiled' = no collection, else an id.
  const [collection, setCollection] = useState<CollectionSelection>(null);
  // Ids from the most recent upload batch, checked for duplicates once the
  // server stamps their content hash (which arrives on a later list poll).
  // Dismissing or deleting a flagged upload drops it from here.
  const [uploadedIds, setUploadedIds] = useState<string[]>([]);
  // The files in the batch currently uploading, newest batch only. Drives both
  // the placeholder rows and the dropzone's "n of m" counter, so the two can't
  // disagree about how far along the batch is.
  const [uploadQueue, setUploadQueue] = useState<PendingUpload[]>([]);
  const [uploadTotal, setUploadTotal] = useState(0);
  // Rows playing their exit. They stay in the list for the length of the
  // animation and are released in the `finally` below, so a delete that fails
  // puts its row back rather than leaving a hole.
  const [exitingIds, setExitingIds] = useState<string[]>([]);

  const toast = useToast();
  const reducedMotion = useReducedMotion();
  const { data: documents, isLoading, isError, error } = useDocuments();
  const { data: collections } = useCollections();
  const upload = useUploadDocument();
  const setCollections = useSetDocumentCollections();
  const uploadBundle = useUploadBundle();
  const remove = useDeleteDocument();
  // The people directory resolves extracted names to canonical identities so
  // the person facet follows aliases. Absent (people app disabled / still
  // loading) it's empty, and every name degrades to a by-spelling identity.
  const { data: directory } = usePeople();

  // A real folder is in scope (not "all", not "unfiled") — the only state in
  // which "remove from collection" means anything.
  const inCollection = collection !== null && collection !== UNFILED;
  const activeCollectionName = inCollection
    ? (collections ?? []).find((c) => c.id === collection)?.name
    : undefined;

  // The selected collection scopes everything below it (facets included), so the
  // facet counts and the visible rows both reflect the chosen folder.
  const collectionScoped = useMemo(() => {
    const all = documents ?? [];
    if (collection === null) return all;
    if (collection === UNFILED) {
      return all.filter((d) => (d.collections ?? []).length === 0);
    }
    return all.filter((d) => (d.collections ?? []).includes(collection));
  }, [documents, collection]);

  // Facets come from the scoped list; the visible rows are what's left after the
  // filters. Both recompute only when the list, directory, or filters change.
  const docTypeFacets = useMemo(
    () => collectDocTypeFacets(collectionScoped),
    [collectionScoped],
  );
  const people = useMemo(
    () => collectPeople(collectionScoped, directory ?? []),
    [collectionScoped, directory],
  );
  const tagFacets = useMemo(() => collectTagFacets(collectionScoped), [collectionScoped]);
  const visibleDocuments = useMemo(
    () => filterDocuments(collectionScoped, filters, directory ?? []),
    [collectionScoped, filters, directory],
  );
  const sortedDocuments = useMemo(
    () => sortDocuments(visibleDocuments, sort),
    [visibleDocuments, sort],
  );

  // A small "42 documents · 3 still reading" summary over the list. Counted off
  // the same rows the number beside it counts — the visible ones — so the two
  // halves of one sentence can't disagree ("4 documents · 7 still reading" was
  // reachable when this counted the whole folder and the count beside it
  // counted what survived the filters).
  const stillReading = useMemo(
    () => sortedDocuments.filter((d) => (d.parse_status ?? 'pending') === 'pending').length,
    [sortedDocuments],
  );

  // Why the list below is empty, when it is. Filters win over folder scope:
  // they're what the reader just changed, and clearing them is the fix. With
  // neither a filter nor a folder in play the list can't be empty — every
  // document is in scope — so that branch never renders.
  const emptyReason: EmptyReason = hasActiveFilters(filters)
    ? 'filters'
    : collection === UNFILED
      ? 'unfiled'
      : inCollection
        ? 'collection'
        : 'filters';

  // Duplicates among the last batch. Recomputes as the list polls, so a match
  // surfaces as soon as the server-stamped hash lands on the uploaded record.
  const duplicates = useMemo(
    () => findDuplicateUploads(documents ?? [], uploadedIds),
    [documents, uploadedIds],
  );

  // Remounts the list — and so replays the cascade — when the arrangement
  // itself changes. Deliberately excludes `filters.search`: the free-text box
  // changes on every keystroke, and re-running the cascade under a typing
  // finger would strobe the page. The discrete controls (sort, folder, the
  // three facet dropdowns) are each a single decision, which is what the
  // cascade is there to acknowledge.
  const listGeneration = [
    sort,
    collection ?? 'all',
    filters.docType,
    filters.person,
    filters.tag,
  ].join('|');

  /**
   * Play a row's exit, then resolve so the caller can send the mutation behind
   * it. Resolves immediately under reduced motion — the CSS guard has already
   * made the animation instant, and waiting out the timer anyway would turn a
   * courtesy into a delay for precisely the people who opted out of it.
   */
  const playRowExit = async (id: string) => {
    if (reducedMotion) return;
    setExitingIds((ids) => [...ids, id]);
    await new Promise((resolve) => setTimeout(resolve, ROW_EXIT_MS));
  };

  const releaseRowExit = (id: string) =>
    setExitingIds((ids) => ids.filter((i) => i !== id));

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    // Sequential: each upload is a multipart POST plus a classify kick-off, and
    // firing a whole folder at once would stampede the AI provider.
    const batch = Array.from(files);
    const ids: string[] = [];

    // Every file in the batch gets a placeholder row immediately, so the drop
    // visibly lands instead of disappearing into a spinner until the list
    // polls. The queue shrinks from the front as files are taken.
    setUploadTotal(batch.length);
    setUploadQueue(
      batch.map((file, i) => ({ id: `${i}-${file.name}`, name: file.name, active: i === 0 })),
    );

    try {
      for (let i = 0; i < batch.length; i += 1) {
        const file = batch[i];
        setUploadQueue(
          batch
            .slice(i)
            .map((queued, j) => ({
              id: `${i + j}-${queued.name}`,
              name: queued.name,
              active: j === 0,
            })),
        );
        try {
          const doc = await upload.mutateAsync(file);
          ids.push(doc.id);
        } catch (err) {
          toast.error(`Couldn't upload ${file.name}. ${getAepErrorMessage(err)}`);
          break;
        }
      }
    } finally {
      setUploadQueue([]);
      setUploadTotal(0);
    }

    setUploadedIds(ids);
    if (inputRef.current) inputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // Files shared to the installed app from another app's share sheet land here
  // (`web.shareTarget` in app.config.ts) and take the plain upload path.
  useSharedFiles((files) => void handleFiles(files));

  // Splitting a bundle (a tax return, a batch scan) is its own entry point: it
  // fires the `split` method instead of `classify`, so the plain upload path
  // above is untouched. The constituent forms arrive in the list as they're read.
  const handleBundle = async (files: FileList | null) => {
    const file = files?.[0];
    if (bundleInputRef.current) bundleInputRef.current.value = '';
    if (!file) return;
    try {
      await uploadBundle.mutateAsync(file);
      toast.info(
        `Splitting “${file.name}” into its separate forms — they'll appear below as they're read.`,
      );
    } catch (err) {
      toast.error(`Couldn't upload ${file.name}. ${getAepErrorMessage(err)}`);
    }
  };

  // Redaction is a File → File step in front of the *same* upload flow: pick one
  // file, edit it, then upload the flattened result. The plain path above is
  // untouched, so uploading without redacting stays the default.
  // A HEIC photo is converted first: the editor draws the image, and most
  // browsers can't decode HEIC.
  const pickRedactTarget = async (files: FileList | null) => {
    const file = files?.[0];
    if (redactInputRef.current) redactInputRef.current.value = '';
    if (!file) return;
    try {
      setRedactTarget(await toUploadable(file));
    } catch (err) {
      toast.error(err);
    }
  };

  const handleRedacted = async (redacted: File) => {
    try {
      await upload.mutateAsync(redacted);
      setRedactTarget(null);
    } catch (err) {
      setRedactTarget(null);
      toast.error(`Couldn't upload ${redacted.name}. ${getAepErrorMessage(err)}`);
    }
  };

  // The redact-then-split outcome: black out the bundle first, then feed the
  // flattened PDF to the split flow instead of the plain upload. Offered only
  // for PDFs (see the editor wiring below) — an image is a single page.
  const handleRedactedSplit = async (redacted: File) => {
    try {
      await uploadBundle.mutateAsync(redacted);
      setRedactTarget(null);
      toast.info(
        `Splitting the redacted “${redacted.name}” into its separate forms — they'll appear ` +
          `below as they're read.`,
      );
    } catch (err) {
      setRedactTarget(null);
      toast.error(`Couldn't upload ${redacted.name}. ${getAepErrorMessage(err)}`);
    }
  };

  const dismissDuplicate = (id: string) =>
    setUploadedIds((ids) => ids.filter((i) => i !== id));

  const deleteDuplicate = async (id: string) => {
    try {
      await playRowExit(id);
      await remove.mutateAsync(id);
      dismissDuplicate(id);
      toast.success('Duplicate deleted');
    } catch (err) {
      toast.error(err);
    } finally {
      releaseRowExit(id);
    }
  };

  const handleDelete = async (doc: Document) => {
    setConfirmDelete(null);
    try {
      // The row collapses first and the request goes after it. The other order
      // — delete, then try to animate — has nothing left to animate: the
      // record is gone from the cache and its row with it.
      await playRowExit(doc.id);
      await remove.mutateAsync(doc.id);
      dismissDuplicate(doc.id);
      toast.success(`Deleted “${doc.title || 'Untitled document'}”`);
    } catch (err) {
      toast.error(err);
    } finally {
      releaseRowExit(doc.id);
    }
  };

  /**
   * Take a document out of the folder being viewed — the one action on this
   * page that a toast can genuinely reverse, since it's a patch of an id list
   * and nothing is destroyed. So it goes through without a dialog and offers
   * the way back instead.
   */
  const handleRemoveFromCollection = async (doc: Document) => {
    if (collection === null || collection === UNFILED) return;
    const before = doc.collections ?? [];
    try {
      await playRowExit(doc.id);
      await setCollections.mutateAsync({
        documentId: doc.id,
        collections: toggleMembership(before, collection, false),
      });
      toast.undo(`Removed from ${activeCollectionName ?? 'the collection'}`, () => {
        void setCollections
          .mutateAsync({ documentId: doc.id, collections: before })
          .catch((err: unknown) => toast.error(err));
      });
    } catch (err) {
      toast.error(err);
    } finally {
      releaseRowExit(doc.id);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        subtitle="Upload a document and we'll read it for you"
        actions={
          <Link
            to="/documents/types"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-surface-white px-4 py-2 text-sm font-medium text-brand-slate transition-colors hover:bg-bg-pearl"
            data-testid="document-types-link"
          >
            <FileText className="h-4 w-4" />
            Supported types
          </Link>
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
        data-testid="document-file-input"
      />
      {/* Opens the rear camera on a phone; a desktop browser ignores `capture`
          and shows its file picker, which is why the button for it shows only
          on touch screens. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
        data-testid="document-camera-input"
      />
      <input
        ref={redactInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void pickRedactTarget(e.target.files)}
        data-testid="document-redact-input"
      />
      <input
        ref={bundleInputRef}
        type="file"
        accept={ACCEPT_PDF}
        className="hidden"
        onChange={(e) => void handleBundle(e.target.files)}
        data-testid="document-bundle-input"
      />

      <DocumentDropzone
        onFiles={(files) => void handleFiles(files)}
        onBrowseUpload={() => inputRef.current?.click()}
        onTakePhoto={() => cameraInputRef.current?.click()}
        onBrowseRedact={() => redactInputRef.current?.click()}
        onBrowseBundle={() => bundleInputRef.current?.click()}
        // The queue, not just the mutation: `isPending` dips to false in the
        // gap between two files of a batch, and driving the label off it alone
        // made "Uploading 2 of 5…" blink back to the idle prompt between every
        // file.
        uploading={upload.isPending || uploadQueue.length > 0}
        bundleBusy={uploadBundle.isPending}
        progress={
          uploadTotal > 1
            ? { done: uploadTotal - uploadQueue.length, total: uploadTotal }
            : undefined
        }
      />

      {documents && (
        <CollectionsBar
          documents={documents}
          selected={collection}
          onSelect={setCollection}
        />
      )}

      {redactTarget && (
        <RedactionEditor
          file={redactTarget}
          onComplete={handleRedacted}
          onSplit={
            redactTarget.type === 'application/pdf' ? handleRedactedSplit : undefined
          }
          onCancel={() => setRedactTarget(null)}
        />
      )}

      <DuplicateUploadWarning
        duplicates={duplicates}
        onDelete={(id) => void deleteDuplicate(id)}
        onDismiss={dismissDuplicate}
        deletingId={remove.isPending ? remove.variables : undefined}
      />

      {isLoading && <DocumentsSkeleton />}

      {isError && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error instanceof Error ? error.message : 'Failed to load documents'}
        </div>
      )}

      {/* Above both the empty state and the list: the very first upload into an
          empty library needs its placeholder row as much as any other, and
          without this it would be the one case that still showed nothing. */}
      <PendingUploadRows uploads={uploadQueue} />

      {documents && documents.length === 0 && uploadQueue.length === 0 && (
        <DocumentsEmptyState reason="library" />
      )}

      {documents && documents.length > 0 && (
        <div className="space-y-3">
          <DocumentFilters
            filters={filters}
            onChange={setFilters}
            docTypes={docTypeFacets}
            people={people}
            tags={tagFacets}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-muted" data-testid="documents-summary">
              <TickingCount value={sortedDocuments.length} />{' '}
              {sortedDocuments.length === 1 ? 'document' : 'documents'}
              {stillReading > 0 && (
                <>
                  {' · '}
                  <TickingCount
                    value={stillReading}
                    data-testid="documents-still-reading"
                  />{' '}
                  still reading
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="document-sort" className="text-xs text-text-muted">
                Sort
              </label>
              <select
                id="document-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                data-testid="document-sort"
                className="rounded-lg border border-gray-200 bg-surface-white px-3 py-1.5 text-sm text-brand-slate focus:border-accent-terracotta focus:outline-none focus:ring-2 focus:ring-accent-terracotta/30"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {sortedDocuments.length > 0 ? (
            // Keyed on the arrangement, not the contents: changing the sort or
            // the folder remounts the rows and replays the cascade, while a
            // poll that returns the same arrangement leaves them alone — so
            // only rows that are genuinely new animate in.
            <div className="space-y-2" data-testid="documents-list" key={listGeneration}>
              {sortedDocuments.map((doc, index) => (
                <DocumentListItem
                  key={doc.id}
                  document={doc}
                  onDelete={() => setConfirmDelete(doc)}
                  onRemoveFromCollection={
                    inCollection ? () => void handleRemoveFromCollection(doc) : undefined
                  }
                  collectionName={activeCollectionName}
                  disabled={remove.isPending || setCollections.isPending}
                  enterDelayMs={Math.min(index, MAX_STAGGERED_ROWS) * ROW_STAGGER_MS}
                  exiting={exitingIds.includes(doc.id)}
                />
              ))}
            </div>
          ) : (
            <DocumentsEmptyState
              reason={emptyReason}
              collectionName={activeCollectionName}
              onClearFilters={() => setFilters({ ...EMPTY_FILTERS })}
              onShowAll={() => setCollection(null)}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && void handleDelete(confirmDelete)}
        title="Delete document"
        message={
          confirmDelete
            ? `Delete “${confirmDelete.title || 'Untitled document'}”? The file goes with it, ` +
              `and this cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={remove.isPending}
      />
    </div>
  );
}
