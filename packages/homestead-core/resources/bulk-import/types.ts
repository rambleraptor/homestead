/**
 * Bulk import contract (AEP-136 custom method `<plural>:bulk-import`).
 *
 * A resource opts in by declaring `bulkImport` on its {@link ResourceDefinition}.
 * The registry synthesizes the custom method from that declaration, so an app
 * never hand-writes a handler, a route, or a page — it lists the file formats it
 * accepts and (optionally) how rows are written.
 *
 * Parsing and writing both run server-side, so the browser, the CLI
 * (`homestead resources <plural> bulk-import`), and any REST caller all drive
 * the same code path.
 *
 * @example
 *   bulkImport: {
 *     formats: [
 *       {
 *         id: 'csv',
 *         label: 'CSV',
 *         inputType: 'file',
 *         accept: '.csv',
 *         load: () => import('./methods/bulk-import-csv'),
 *       },
 *     ],
 *   }
 */

import type { CustomMethodAuth } from '../types';

/**
 * Where a format's input comes from.
 *
 * - `file` → the UI shows a file picker (filtered by {@link BulkImportFormat.accept}).
 * - `text` → the UI shows a textarea (e.g. recipes' paste-a-webpage importer).
 */
export type BulkImportInputType = 'file' | 'text';

/** A single uploaded file, decoded from the request's base64 payload. */
export interface BulkImportFile {
  name: string;
  mimeType?: string;
  bytes: Uint8Array;
}

/**
 * Input handed to a parser. Exactly one arm is populated, matching the
 * format's declared {@link BulkImportFormat.inputType}.
 */
export interface BulkImportInput {
  /** Populated for `inputType: 'text'` formats. */
  text?: string;
  /**
   * Populated for `inputType: 'file'` formats. Always at least one entry;
   * more than one only when the format declares `multiple`.
   */
  files?: BulkImportFile[];
}

/** Context handed to a parser and a saver. */
export interface BulkImportContext {
  /** Authenticated caller — bulk import always runs authenticated. */
  auth: CustomMethodAuth;
  /** Plural of the resource being imported into, e.g. `gift-cards`. */
  plural: string;
}

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

/**
 * Turns raw input into candidate records. Pure and side-effect free — it must
 * not write anything, since the dry-run calls it too.
 */
export interface BulkImportParser<T = unknown> {
  parse(
    input: BulkImportInput,
    ctx: BulkImportContext,
  ): Promise<ParsedItem<T>[]> | ParsedItem<T>[];
  /**
   * The columns this parser reads, surfaced on the import page so users know
   * what the file should contain. `createCsvParser` fills this in from the
   * schema; a hand-written parser may set it or leave it off.
   */
  columns?: BulkImportColumnInfo[];
}

/**
 * A file format a resource can be imported from.
 *
 * Adding a format to an app is this object plus one module default-exporting a
 * {@link BulkImportParser} — nothing else. The `load` thunk is a lazy
 * `import()` for the same reason custom-method handlers are: `resources.ts` is
 * reachable from the client registry, so the parser must be code-split away and
 * stubbed out of the browser bundle (see the `stubCustomMethods` plugin in
 * `homestead-app/vite.config.ts`, which matches `methods/*`).
 */
export interface BulkImportFormat {
  /** Stable id used on the wire, e.g. `csv`. Unique within a resource. */
  id: string;
  /** Human-readable name for the UI's format picker, e.g. `Paprika archive`. */
  label: string;
  inputType: BulkImportInputType;
  /** `accept` attribute for the file picker, e.g. `.csv`. File formats only. */
  accept?: string;
  /** Whether several files may be imported at once. File formats only. */
  multiple?: boolean;
  /**
   * One line of guidance shown under the format picker — what to paste or
   * upload. Optional; the page's generic prompt is used without it.
   */
  description?: string;
  /**
   * The parser needs the configured AI model. Such a format is left out of the
   * format list while AI isn't set up, and a call naming it is refused (503)
   * before any operation starts.
   */
  requiresAi?: boolean;
  /**
   * Whether the parser module exports a `template` — a downloadable starter
   * file (a CSV header row, typically). Declared as a flag here, rather than
   * the content itself, so the template lives next to the schema it documents
   * instead of being restated in `resources.ts` where it would drift.
   */
  hasTemplate?: boolean;
  /** Lazy import of the parser module. */
  load: () => Promise<{
    default: BulkImportParser;
    /** Starter file contents. Required when `hasTemplate` is set. */
    template?: () => string;
  }>;
}

/** Outcome of writing the selected items. */
export interface BulkImportSaveResult {
  created: number;
  failed: Array<{ index: number; error: string }>;
}

/**
 * Optional custom write step. Receives every selected item at once (not row by
 * row), which is what lets an app do multi-pass work the default saver can't:
 * people creates everyone and then resolves partner-by-name in a second pass;
 * pictionary creates a game plus its team children.
 *
 * Defaults to one create per item against the resource's own collection.
 */
export type BulkImportSaver<T = unknown> = (args: {
  items: ParsedItem<T>[];
  ctx: BulkImportContext;
}) => Promise<BulkImportSaveResult>;

/** What a resource declares to opt into bulk import. */
export interface BulkImportDef<T = unknown> {
  /** Formats this resource accepts. At least one. */
  formats: BulkImportFormat[];
  /**
   * Lazy import of a module exporting the resource's custom write step as
   * `save`. Omit to create one record per item.
   *
   * A thunk rather than the function itself for the same reason parsers are:
   * `resources.ts` is reachable from the client registry, so naming the saver
   * directly would drag server-only code into the browser bundle.
   */
  save?: () => Promise<{ save: BulkImportSaver<T> }>;
}

// ----------------------------------------------------------------------------
// Wire shapes
// ----------------------------------------------------------------------------

/** Selects every item the parser reported as importable (no errors). */
export const SELECT_ALL_VALID = '*';

/** Request body for `POST /<plural>:bulk-import`. */
export interface BulkImportRequest {
  /** Format id, matching a {@link BulkImportFormat.id} on the resource. */
  format: string;
  /**
   * The uploads for `file` formats: more than one only when the format
   * declares `multiple`. On the wire the request is multipart — the body in a
   * `body` part, each file in its own part, named here by an
   * `{ "$upload": "<part>" }` placeholder (the custom-method body convention;
   * the shared client's `encodeMethodBody` builds it). The handler sees `File`s,
   * with their names and media types.
   */
  files?: Array<File | { $upload: string }>;
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
  /** From the parser's {@link BulkImportParser.columns}; drives the page's format reference. */
  columns?: BulkImportColumnInfo[];
}
