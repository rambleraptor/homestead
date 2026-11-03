/**
 * Bulk import and export for a collection — the standardized
 * `<plural>:bulk-import` / `<plural>:bulk-export` custom methods, wrapped so a
 * caller never builds the request, encodes files, or polls the operation.
 *
 * ```ts
 * const recipes = hs.collection('recipes');
 * const preview = await recipes.bulkImport.preview({ format: 'paprika', files: [file] });
 * // show preview.items, let someone pick…
 * await recipes.bulkImport.importPreview({ format: 'paprika', previewId: preview.preview_id, selected: [0, 2] });
 *
 * // or in one step, everything importable:
 * await recipes.bulkImport.run({ format: 'social', text: 'https://www.tiktok.com/@cook/video/1' });
 * ```
 */

import type { Http } from './http';
import { errorFromResponse } from './errors';
import { encodeMethodBody } from './refs';
import { OperationsApi, type AwaitOperationOptions, type Operation } from './operations';
import type {
  BulkImportPreview,
  BulkImportRequest,
  BulkImportResult,
} from './bulk-import-types';
import { SELECT_ALL_VALID } from './bulk-import-types';

export const BULK_IMPORT_VERB = 'bulk-import';
export const BULK_EXPORT_VERB = 'bulk-export';

/** What to import: a format and its input — `text` for text formats, `files` for file formats. */
export interface BulkImportSource {
  format: string;
  text?: string;
  files?: Blob[];
}

/** Which preview rows to write: indices, or `'*'` for every importable row (the default). */
export type BulkImportSelection = number[] | typeof SELECT_ALL_VALID;

export interface BulkImportApi<T = unknown> {
  /**
   * Parse without writing (AEP-163 `validate_only`) and wait for the preview.
   * Its `preview_id` names exactly these rows for {@link importPreview}.
   */
  preview(source: BulkImportSource, options?: AwaitOperationOptions): Promise<BulkImportPreview<T>>;
  /** Write rows of an earlier preview, without re-sending or re-parsing the input. */
  importPreview(
    args: { format: string; previewId: string; selected?: BulkImportSelection },
    options?: AwaitOperationOptions,
  ): Promise<BulkImportResult>;
  /** Parse and write in one call — every importable row unless `selected` says otherwise. */
  run(
    source: BulkImportSource & { selected?: BulkImportSelection },
    options?: AwaitOperationOptions,
  ): Promise<BulkImportResult>;
  /** Start any bulk-import request and return its operation without waiting. */
  start(request: BulkImportRequest): Promise<Operation>;
}

export interface BulkExportOptions {
  /** A declared format id; the resource's first format when omitted. */
  format?: string;
  /** A list filter selecting the rows (e.g. `id in ["a", "b"]`); every row when omitted. */
  filter?: string;
  /** Download filename override. */
  filename?: string;
  /** Declared export options (e.g. `{ combine_households: true }`). */
  options?: Record<string, boolean>;
}

function sourceBody(source: BulkImportSource): BulkImportRequest {
  return {
    format: source.format,
    ...(source.text !== undefined ? { text: source.text } : {}),
    ...(source.files !== undefined ? { files: source.files } : {}),
  };
}

export class BulkImportApiImpl<T = unknown> implements BulkImportApi<T> {
  private readonly operations: OperationsApi;

  constructor(
    private readonly http: Http,
    /** Collection path with a leading slash, e.g. `/recipes`. */
    private readonly path: string,
  ) {
    this.operations = new OperationsApi(http);
  }

  start(request: BulkImportRequest): Promise<Operation> {
    return this.http.request<Operation>(`${this.path}:${BULK_IMPORT_VERB}`, {
      method: 'POST',
      body: encodeMethodBody(request as unknown as Record<string, unknown>),
      includeUserId: true,
    });
  }

  private async startAndAwait<R>(request: BulkImportRequest, options?: AwaitOperationOptions): Promise<R> {
    const operation = await this.start(request);
    if (!operation.id) throw new Error('bulk import answered without an operation id');
    return this.operations.await<R>(operation.id, options);
  }

  preview(source: BulkImportSource, options?: AwaitOperationOptions): Promise<BulkImportPreview<T>> {
    return this.startAndAwait({ ...sourceBody(source), validate_only: true }, options);
  }

  importPreview(
    { format, previewId, selected }: { format: string; previewId: string; selected?: BulkImportSelection },
    options?: AwaitOperationOptions,
  ): Promise<BulkImportResult> {
    return this.startAndAwait(
      { format, preview_id: previewId, ...(selected !== undefined ? { selected_indices: selected } : {}) },
      options,
    );
  }

  run(
    source: BulkImportSource & { selected?: BulkImportSelection },
    options?: AwaitOperationOptions,
  ): Promise<BulkImportResult> {
    return this.startAndAwait(
      {
        ...sourceBody(source),
        ...(source.selected !== undefined ? { selected_indices: source.selected } : {}),
      },
      options,
    );
  }
}

/** `GET <plural>:bulk-export` → the file. */
export async function bulkExport(http: Http, path: string, options: BulkExportOptions = {}): Promise<Blob> {
  const query: Record<string, string | undefined> = {
    format: options.format,
    filter: options.filter,
    filename: options.filename,
  };
  for (const [key, value] of Object.entries(options.options ?? {})) query[key] = String(value);
  const res = await http.raw(`${path}:${BULK_EXPORT_VERB}`, { query, includeUserId: true });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    throw errorFromResponse(res.status, `${path}:${BULK_EXPORT_VERB}`, text, parsed);
  }
  return res.blob();
}
