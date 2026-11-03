/**
 * Wire types for bulk import (`POST /<plural>:bulk-import`, AEP-136 + AEP-151).
 *
 * The client owns the wire contract; the server's bulk-import framework
 * (`@rambleraptor/homestead-core/resources/bulk-import/types`) re-exports
 * these, so both sides compile against one definition.
 */

/**
 * Where a format's input comes from.
 *
 * - `file` → the UI shows a file picker (filtered by the format's `accept`).
 * - `text` → the UI shows a textarea (e.g. recipes' paste-a-webpage importer).
 */
export type BulkImportInputType = 'file' | 'text';

/**
 * One candidate record produced by a parser.
 *
 * A parser reports problems per item rather than throwing, so one bad row
 * never sinks the whole file: items carrying `errors` are shown in the preview
 * as un-importable but leave their neighbours importable.
 */
export interface ParsedItem<T = unknown> {
  /**
   * Zero-based position within this parse. Stable across the dry-run and the
   * real call for the same input, which is what makes `selected_indices`
   * meaningful — see {@link BulkImportRequest.selected_indices}.
   */
  index: number;
  /** The candidate record. Only meaningful when `errors` is empty. */
  data: T;
  /** Problems that make this item un-importable. Empty means importable. */
  errors: string[];
  /** Problems worth surfacing that don't block import. */
  warnings: string[];
  /**
   * Human-readable label for the preview row (e.g. a recipe title, a
   * cardholder name). Falls back to `Row <index + 1>` in the UI.
   */
  label?: string;
}

/** One input column/field, described for the import page's format reference. */
export interface BulkImportColumnInfo {
  name: string;
  required: boolean;
  description?: string;
}

/** Selects every item the parser reported as importable (no errors). */
export const SELECT_ALL_VALID = '*';

/** Request body for `POST /<plural>:bulk-import`. */
export interface BulkImportRequest {
  /** Format id, matching a a format id on the resource. */
  format: string;
  /**
   * The uploads for `file` formats: more than one only when the format
   * declares `multiple`. On the wire the request is multipart — the body in a
   * `body` part, each file in its own part, named here by an
   * `{ "$upload": "<part>" }` placeholder (the custom-method body convention;
   * the shared client's `encodeMethodBody` builds it). The handler sees `File`s,
   * with their names and media types.
   */
  files?: Array<Blob | { $upload: string }>;
  /** Raw input for `text` formats. */
  text?: string;
  /**
   * Parse and report without writing anything — AEP-163 change validation.
   * The response is a {@link BulkImportPreview}.
   */
  validate_only?: boolean;
  /**
   * Import the rows of an earlier dry run instead of parsing again — the
   * `preview_id` its response carried. Same caller, resource and `format` only;
   * single-use, and forgotten after an hour or a server restart (a `410` says
   * to preview again). `text` / `files` are not needed alongside it.
   *
   * Omit it to parse the input afresh, as a one-shot CLI or REST import does.
   */
  preview_id?: string;
  /**
   * Which parsed items to write. An explicit index list, or `'*'` for every
   * importable item. Defaults to `'*'`, so a CLI or REST caller can post a file
   * and get everything importable without a preview round-trip.
   *
   * Indices refer to the server's own parse — the held preview named by
   * `preview_id`, or else this request's input, parsed afresh. Records are never
   * taken from the client, so the server stays the only parser.
   * Selecting an index whose item has errors is rejected rather than silently
   * skipped.
   */
  selected_indices?: number[] | typeof SELECT_ALL_VALID;
}

/** Tallies shared by the dry-run and the real response. */
export interface BulkImportSummary {
  total: number;
  valid: number;
  invalid: number;
}

/**
 * Operation `response` payload when `validate_only` is true (AEP-163).
 *
 * Like every bulk-import call this runs as an AEP-151 operation: the request
 * gets `202` + a pending operation, and the caller polls it (the browser via
 * `awaitOperation`). A preview of a large archive is real work, so it gets the
 * same progress and restart-recovery treatment as the import itself.
 */
export interface BulkImportPreview<T = unknown> {
  validate_only: true;
  /**
   * Names this parse for the import that follows (see
   * {@link BulkImportRequest.preview_id}), so it writes exactly these items.
   */
  preview_id: string;
  items: ParsedItem<T>[];
  summary: BulkImportSummary;
}

/** Operation `response` payload for a real import. */
export interface BulkImportResult {
  validate_only: false;
  created: number;
  failed: Array<{ index: number; error: string }>;
  summary: BulkImportSummary;
}

/** Format metadata served by `GET /api/custom-methods` for the UI's picker. */
export interface BulkImportFormatInfo {
  id: string;
  label: string;
  input_type: BulkImportInputType;
  accept?: string;
  multiple: boolean;
  has_template: boolean;
  description?: string;
  /** From the parser's the parser's declared columns; drives the page's format reference. */
  columns?: BulkImportColumnInfo[];
}
