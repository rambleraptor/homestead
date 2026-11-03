/**
 * Bulk export contract (AEP-136 custom method `<plural>:bulk-export`).
 *
 * The mirror image of {@link ../bulk-import/types bulk import}. A resource opts
 * in by declaring `bulkExport` on its {@link ResourceDefinition}; the registry
 * synthesizes the custom method from that declaration, so an app never
 * hand-writes a handler, a route, or a page — it lists the file formats it can
 * be exported to and (optionally) how the rows are fetched.
 *
 * Where bulk import runs `parse → save` (bytes in, records written), bulk export
 * runs `source → serialize` (records read, bytes out):
 *
 *   import:  file  ──parser──▶  rows  ──saver──▶   collection writes
 *   export:  query ──source──▶  rows  ──serializer──▶ file
 *
 * Fetching and serializing both run server-side, so the browser, the CLI
 * (`homestead resources <plural> bulk-export`), and any REST caller all drive
 * the same code path. Unlike import (a POST that spawns an AEP-151 operation),
 * export is a plain **GET** that streams the file back with a
 * `Content-Disposition` attachment header — a download is a read, so it needs
 * neither a request body nor progress polling.
 *
 * @example
 *   bulkExport: {
 *     formats: [
 *       {
 *         id: 'csv',
 *         label: 'CSV',
 *         mimeType: 'text/csv',
 *         extension: 'csv',
 *         load: () => import('./methods/bulk-export-csv'),
 *       },
 *     ],
 *   }
 */

import type { CustomMethodAuth } from '../types';

/** Context handed to a source and a serializer. Mirrors `BulkImportContext`. */
export interface BulkExportContext {
  /** Authenticated caller — bulk export always runs authenticated. */
  auth: CustomMethodAuth;
  /** Plural of the resource being exported, e.g. `people`. */
  plural: string;
}

/** One output column, described for the export page's format reference. */
export interface BulkExportColumnInfo {
  name: string;
  description?: string;
}

/**
 * Fetches the records to export and shapes them into flat rows.
 *
 * The mirror of {@link BulkImportSaver}: it receives the whole request at once
 * (not row by row), so it can do the cross-collection joins the default can't —
 * people flattens each person together with the address that lives in a sibling
 * resource, which is exactly the inverse of what the people importer's saver
 * writes.
 *
 * Defaults to listing the resource's own collection: one row per record, its
 * own columns.
 */
export type BulkExportSource<T = unknown> = (args: {
  ctx: BulkExportContext;
  /**
   * aepbase list-filter string from the request's `?filter=` query param, or
   * undefined for "everything". A custom source may honor it or ignore it; the
   * default source passes it straight through to the collection list.
   *
   * This is also how an explicit record selection travels: the engine's `id`
   * column is filterable and `in` accepts a list literal, so the UI exports
   * exactly the rows a user ticked with `id in ["a", "b", ...]` — no separate
   * selection channel needed.
   */
  filter?: string;
  /**
   * Values of the resource's declared export {@link BulkExportOption}s, keyed by
   * option id, from the request's query params. Every declared option is present
   * (its declared `default` fills in when the caller omitted it), so a source
   * can read `options.combine_households` without a presence check. The default
   * source ignores them; only a custom source acts on them.
   */
  options?: Record<string, boolean>;
}) => Promise<T[]> | T[];

/**
 * Turns rows into a file's bytes. Pure and side-effect free — it must not write
 * anything. The inverse of {@link BulkImportParser}.
 */
export interface BulkExportSerializer<T = unknown> {
  serialize(
    rows: T[],
    ctx: BulkExportContext,
  ): Promise<Uint8Array | string> | Uint8Array | string;
  /**
   * The columns this serializer emits, surfaced on the export page so users
   * know what the file will contain. `createCsvSerializer` fills this in from
   * its column list; a hand-written serializer may set it or leave it off.
   */
  columns?: BulkExportColumnInfo[];
}

/**
 * A file format a resource can be exported to.
 *
 * Adding a format is this object plus one module default-exporting a
 * {@link BulkExportSerializer} — nothing else. The `load` thunk is a lazy
 * `import()` for the same reason import's parsers are: `resources.ts` is
 * reachable from the client registry, so the serializer must be code-split away
 * and stubbed out of the browser bundle (the `stubCustomMethods` plugin in
 * `homestead-app/vite.config.ts` matches `methods/*`).
 */
export interface BulkExportFormat {
  /** Stable id used on the wire, e.g. `csv`. Unique within a resource. */
  id: string;
  /** Human-readable name for the UI's format picker, e.g. `CSV`. */
  label: string;
  /** `Content-Type` served on the download, e.g. `text/csv`. */
  mimeType: string;
  /** File extension (no dot) for the download filename, e.g. `csv`. */
  extension: string;
  /** Lazy import of the serializer module. */
  load: () => Promise<{ default: BulkExportSerializer }>;
}

/**
 * A toggle offered on the export screen — a per-resource knob that changes how
 * the source shapes the export (e.g. "combine household members into one row").
 * Rendered generically by the screen from this declaration; its meaning lives
 * entirely in the resource's {@link BulkExportSource}. Only boolean options are
 * supported for now.
 */
export interface BulkExportOption {
  /** Query-param key and the key under {@link BulkExportSource}'s `options`. */
  id: string;
  /** Checkbox label shown on the export screen. */
  label: string;
  type: 'boolean';
  /** Applied when the caller omits the option. Defaults to `false`. */
  default?: boolean;
}

/** What a resource declares to opt into bulk export. */
export interface BulkExportDef<T = unknown> {
  /** Formats this resource can be exported to. At least one. */
  formats: BulkExportFormat[];
  /**
   * Lazy import of a module exporting the resource's row source as `source`.
   * Omit to list the resource's own collection, one row per record.
   *
   * A thunk rather than the function itself for the same reason import's saver
   * is: `resources.ts` is reachable from the client registry, so naming the
   * source directly would drag server-only code into the browser bundle.
   */
  source?: () => Promise<{ source: BulkExportSource<T> }>;
  /**
   * Toggles the export screen renders and passes to the source (see
   * {@link BulkExportOption}). Only a custom `source` can act on them. Option
   * ids must not collide with the reserved params `format`/`filter`/`filename`.
   */
  options?: BulkExportOption[];
}

// ----------------------------------------------------------------------------
// Wire shapes
// ----------------------------------------------------------------------------

/**
 * Format metadata served by `GET /api/custom-methods` for the UI's picker, with
 * the `load` thunk dropped — the picker needs the labels and column docs but
 * must never see server-only code.
 */
export interface BulkExportFormatInfo {
  id: string;
  label: string;
  mime_type: string;
  extension: string;
  /** From the serializer's {@link BulkExportSerializer.columns}. */
  columns?: BulkExportColumnInfo[];
}
