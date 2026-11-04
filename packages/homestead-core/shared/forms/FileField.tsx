/**
 * A configurable file/image field widget for `SchemaForm`, and the `fileField()`
 * factory that binds it to a set of options. It consolidates the hand-rolled
 * upload widgets across the apps: a dashed drag-and-drop target (mirroring
 * `DocumentDropzone`), an image thumbnail or filename-chip preview, a remove
 * control, and inline type/size validation. The form value is `File | null`;
 * an existing stored file is previewed via an injectable `useRemoteUrl` hook.
 *
 * Define the widget at module scope so its identity is stable across renders:
 *
 *   const receiptField = fileField({ accept: 'image/*,application/pdf', maxSizeBytes: 10e6 });
 *   // …fields={{ receipt_file: { widget: receiptField, bare: true } }}
 */

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { Upload, Trash2, X } from 'lucide-react';
import { fieldLabel } from './helpers';
import type { FieldWidget, FieldWidgetProps } from './types';

export interface FileFieldOptions {
  /** `accept` attribute; also drives the default type validation. */
  accept: string;
  /** Maximum file size in bytes. */
  maxSizeBytes: number;
  /** Secondary line under the prompt, e.g. "Image or PDF, max 10MB". */
  hint?: string;
  /** `image` = thumbnail; `file` = filename chip; `auto` (default) = thumbnail
   *  for an image, chip otherwise. */
  preview?: 'image' | 'file' | 'auto';
  /** `alt` for the thumbnail. Defaults to the field label. */
  previewAlt?: string;
  /** Enable drag-and-drop onto the target. Default true. */
  dragDrop?: boolean;
  /** Override the default type/size check; return an error message or null. */
  validate?: (file: File) => string | null;
  /** Resolve a stored file's preview URL on edit — an injectable hook, called
   *  unconditionally in the widget body (its presence is fixed per widget). */
  useRemoteUrl?: (props: FieldWidgetProps) => string | null;
}

function acceptsFile(accept: string, file: File): boolean {
  if (!accept || accept === '*/*') return true;
  return accept
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .some((pat) => {
      if (pat.endsWith('/*')) return file.type.startsWith(pat.slice(0, -1));
      if (pat.startsWith('.')) return file.name.toLowerCase().endsWith(pat.toLowerCase());
      return file.type === pat;
    });
}

function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
}

function defaultValidator(options: FileFieldOptions): (file: File) => string | null {
  return (file) => {
    if (!acceptsFile(options.accept, file)) return 'Unsupported file type.';
    if (file.size > options.maxSizeBytes) return `File must be smaller than ${formatMb(options.maxSizeBytes)}.`;
    return null;
  };
}

/** Fallback "remote URL" hook so the real one can be called unconditionally. */
const NO_REMOTE_URL = (): string | null => null;

function FileFieldControl({ options, ...p }: FieldWidgetProps & { options: FileFieldOptions }) {
  const useRemote = options.useRemoteUrl ?? NO_REMOTE_URL;
  const remoteUrl = useRemote(p);

  // The widget tracks the file it accepted itself, so its preview/filename are
  // correct immediately — before (and independent of) the parent echoing `value`
  // back. `value` is the fallback when the parent seeds a File directly.
  const [picked, setPicked] = useState<File | null>(null);
  const file = picked ?? (p.value instanceof File ? p.value : null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL when it's replaced or the widget unmounts.
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const label = fieldLabel(p.name, p.field, p.config);
  const validate = options.validate ?? defaultValidator(options);
  const previewUrl = blobUrl ?? (removed ? null : remoteUrl);
  const isImage = file ? file.type.startsWith('image/') : (options.preview ?? 'auto') !== 'file';
  const asImage = (options.preview ?? 'auto') === 'image' || ((options.preview ?? 'auto') === 'auto' && isImage);

  const accept = (f: File) => {
    const err = validate(f);
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    setRemoved(false);
    setPicked(f);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    p.onChange(f);
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) accept(f);
  };

  const remove = () => {
    setLocalError(null);
    setPicked(null);
    setBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setRemoved(true);
    p.onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const dragProps =
    options.dragDrop === false
      ? {}
      : {
          onDragOver: (e: DragEvent) => {
            e.preventDefault();
            setDragging(true);
          },
          onDragLeave: () => setDragging(false),
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) accept(f);
          },
        };

  const error = localError ?? p.error;
  const errorId = error ? `${p.id}-error` : undefined;

  return (
    <div className="w-full">
      <label htmlFor={p.id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {p.required && (
          <span className="text-red-500" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>

      <input
        ref={inputRef}
        id={p.id}
        type="file"
        accept={options.accept}
        onChange={onInput}
        disabled={p.disabled}
        data-testid={p.testId}
        aria-required={p.required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId ?? p.describedBy}
        className="hidden"
      />

      {previewUrl && asImage ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt={options.previewAlt ?? label}
            className="w-full h-48 object-cover rounded-lg border border-gray-300"
          />
          <button
            type="button"
            onClick={remove}
            aria-label="Remove file"
            title="Remove file"
            className="absolute top-2 right-2 p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : file || (previewUrl && !asImage) ? (
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg">
          <span className="text-sm text-gray-700 truncate">{file?.name ?? 'Stored file'}</span>
          <button
            type="button"
            onClick={remove}
            aria-label="Remove file"
            className="ml-2 text-red-500 hover:text-red-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          {...dragProps}
          className={`flex flex-col items-center justify-center gap-1 w-full px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
            dragging
              ? 'border-accent-terracotta bg-accent-terracotta/5'
              : 'border-gray-300 hover:border-accent-terracotta'
          }`}
        >
          <Upload className="w-6 h-6 text-gray-400" />
          <span className="text-sm text-text-muted">
            {options.dragDrop === false ? 'Click to upload' : 'Drop a file here, or click to browse'}
          </span>
          {options.hint && <span className="text-xs text-gray-400">{options.hint}</span>}
        </div>
      )}

      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Build a file-field {@link FieldWidget} bound to `options`. Assign the result
 * to a module-level constant (stable identity) and reference it from a field's
 * `config.widget` with `bare: true`.
 */
export function fileField(options: FileFieldOptions): FieldWidget {
  const Widget = (props: FieldWidgetProps) => <FileFieldControl {...props} options={options} />;
  Widget.displayName = 'FileField';
  return Widget;
}
