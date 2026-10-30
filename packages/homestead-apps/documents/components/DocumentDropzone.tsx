/**
 * The upload surface at the top of the documents index: a real drag-and-drop
 * dropzone (click to browse, drag-over highlight) with the specialised paths —
 * redact-first, split-a-bundle — tucked into a menu beneath it.
 *
 * The dropzone *is* the upload button: it takes a drop and it opens the file
 * picker on click or Enter. A separate "Upload document" button below it said
 * the same thing a second time, in a smaller voice, directly under a target
 * that already filled the width of the page.
 *
 * The other two paths are rare and need explaining, which is exactly what a
 * menu is for — each carries its own one-line description, so the "What do
 * these do?" disclosure that used to sit alongside them has nothing left to
 * explain.
 *
 * On a phone the quickest way in is the camera, so a "Take a photo" button sits
 * beside the menu — on touch screens only, since a desktop browser ignores
 * `capture` and would just show the file picker the dropzone already opens.
 *
 * The hidden file inputs live in the parent so the e2e harness can drive them
 * directly; this component just reports intent.
 */

import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronDown, Loader2, Upload, Shield, Scissors } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface DocumentDropzoneProps {
  /** Files dropped onto the surface go straight to the plain upload path. */
  onFiles: (files: FileList | null) => void;
  onBrowseUpload: () => void;
  /** Open the camera to photograph something; the photo takes the plain upload path. */
  onTakePhoto: () => void;
  onBrowseRedact: () => void;
  onBrowseBundle: () => void;
  uploading: boolean;
  bundleBusy: boolean;
  /**
   * How far through a multi-file batch the upload is, when there is more than
   * one file. Uploads run one at a time, so without this a five-file drop said
   * "Uploading…" for five files' worth of time and never said which one.
   */
  progress?: { done: number; total: number };
}

interface UploadOption {
  testId: string;
  label: string;
  description: string;
  icon: LucideIcon;
  onSelect: () => void;
}

export function DocumentDropzone({
  onFiles,
  onBrowseUpload,
  onTakePhoto,
  onBrowseRedact,
  onBrowseBundle,
  uploading,
  bundleBusy,
  progress,
}: DocumentDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on an outside click or on Escape — the menu idiom this follows lives
  // in `BulkExportButton`.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const options: UploadOption[] = [
    {
      testId: 'document-redact-button',
      label: 'Redact & upload',
      description: 'Black out sensitive areas before the file leaves your device.',
      icon: Shield,
      onSelect: onBrowseRedact,
    },
    {
      testId: 'document-bundle-button',
      label: 'Split a tax return',
      description: 'One PDF of several forms becomes one document per form.',
      icon: Scissors,
      onSelect: onBrowseBundle,
    },
  ];

  const busy = uploading || bundleBusy;

  // "Uploading 2 of 5…" only where it says something a plain "Uploading…"
  // doesn't. A single file has no progress to report — the count would just be
  // "1 of 1" — and the row for it is already on screen below.
  const multiple = !!progress && progress.total > 1;
  const uploadingLabel =
    multiple && progress
      ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
      : 'Uploading…';
  const fraction = multiple && progress ? progress.done / progress.total : 0;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && onBrowseUpload()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
            e.preventDefault();
            onBrowseUpload();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        data-testid="document-dropzone"
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? 'border-accent-terracotta bg-accent-terracotta/5'
            : 'border-gray-200 bg-bg-pearl/60 hover:border-accent-terracotta/60 hover:bg-bg-pearl'
        }`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-terracotta/10 text-accent-terracotta">
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Upload className="h-6 w-6" />
          )}
        </span>
        <div className="w-full">
          <p className="text-sm font-semibold text-brand-navy" data-testid="dropzone-status">
            {uploading ? uploadingLabel : 'Drop a document here, or click to browse'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            PDF or photo · multi-page PDFs welcome · we&rsquo;ll read it for you
          </p>

          {/* A batch's progress as a bar as well as a count. It fills per
              completed file rather than per byte — the upload hook reports no
              byte progress — so it steps rather than glides, which is honest
              about what is actually known. Width is a layout property, but this
              is one element that exists only while a batch is uploading, not
              something on a list or a hot path. */}
          {multiple && uploading && (
            <span
              className="mx-auto mt-3 block h-1 w-40 max-w-full overflow-hidden rounded-full bg-accent-terracotta/15"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress?.total ?? 0}
              aria-valuenow={progress?.done ?? 0}
              aria-label="Upload progress"
              data-testid="dropzone-progress"
            >
              <span
                className="block h-full rounded-full bg-accent-terracotta transition-[width] duration-(--duration-settle) ease-out-soft"
                style={{ width: `${Math.round(fraction * 100)}%` }}
              />
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onTakePhoto}
          disabled={uploading}
          data-testid="document-camera-button"
          className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-surface-white px-3 py-2 text-sm font-medium text-brand-slate transition-colors hover:bg-bg-pearl disabled:opacity-50 pointer-coarse:inline-flex"
        >
          <Camera className="h-4 w-4" />
          Take a photo
        </button>
        <div ref={menuRef} className="relative inline-block">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-testid="document-upload-menu"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-surface-white px-3 py-2 text-sm font-medium text-brand-slate transition-colors hover:bg-bg-pearl disabled:opacity-50"
          >
            {bundleBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            More ways to add
          </button>

          {menuOpen && (
            <div
              role="menu"
              data-testid="document-upload-menu-items"
              className="animate-menu-in absolute right-0 z-10 mt-1 w-72 origin-top-right rounded-xl border border-gray-200 bg-surface-white p-1 shadow-md"
            >
              {options.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.testId}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      option.onSelect();
                    }}
                    data-testid={option.testId}
                    className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-pearl"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-slate" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-brand-navy">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-text-muted">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
