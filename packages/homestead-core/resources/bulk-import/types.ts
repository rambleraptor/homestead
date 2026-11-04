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

// The wire contract is defined by the shared client; re-exported here so the
// server framework and the client compile against one definition.
export { SELECT_ALL_VALID } from '@rambleraptor/homestead-client';
export type {
  BulkImportColumnInfo,
  BulkImportFormatInfo,
  BulkImportInputType,
  BulkImportPreview,
  BulkImportRequest,
  BulkImportResult,
  BulkImportSummary,
  ParsedItem,
} from '@rambleraptor/homestead-client';
import type {
  BulkImportColumnInfo,
  BulkImportInputType,
  ParsedItem,
} from '@rambleraptor/homestead-client';

import type { CustomMethodAuth } from '../types';

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
  /**
   * Id of the {@link BulkImportFormat} that produced the items, e.g. `csv`. A
   * saver that treats one source differently (recipes file social-post
   * imports into an automatic cookbook) branches on it rather than guessing
   * from the data.
   */
  format: string;
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
  /**
   * Ids of the records created, in item order. Filled by the default saver
   * (`createOnePerItem`) so a custom saver that wraps it can follow up on the
   * new records; left out of the operation's response.
   */
  createdIds?: string[];
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

