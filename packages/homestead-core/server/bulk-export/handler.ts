/**
 * The one bulk-export handler.
 *
 * Every resource declaring `bulkExport` shares this handler — it finds its own
 * declaration from `ctx.plural`, so an app contributes formats and (optionally)
 * a source, never a handler. Registered as a synchronous **GET** custom method
 * by `./method.ts`: a download is a read, so it streams the file back directly
 * with a `Content-Disposition` attachment header rather than spawning an
 * operation the way bulk import does.
 *
 * Server-only: reachable from the synthesized method's lazy `load()` under
 * `core/server/`, which the client registry never imports.
 */

import type {
  CustomMethodContext,
  CustomMethodHandler,
} from '../../resources/types';
import type {
  BulkExportContext,
  BulkExportSource,
} from '../../resources/bulk-export/types';
import { getResourceBulkExport } from '../../apps/registry';
import { serverClient } from '../client';
import { problemResponse } from '../../resources/problem';

/**
 * Stream the requested format for the requested rows. Query params:
 *   - `format`  — a format id declared on the resource (defaults to the first).
 *   - `filter`  — an aepbase list-filter passed to the source (defaults to all).
 *                 A record selection rides here too, as `id in ["a", "b", ...]`.
 *   - `filename`— override the download filename (defaults to `<plural>.<ext>`).
 *   - one param per declared {@link BulkExportOption} (e.g. `combine_households=true`).
 */
const bulkExport: CustomMethodHandler = async (ctx: CustomMethodContext) => {
  const def = getResourceBulkExport(ctx.plural);
  if (!def) return problem(404, `${ctx.plural} does not support bulk export`);

  const params = new URL(ctx.request.url).searchParams;

  const requested = params.get('format');
  const format = requested
    ? def.formats.find((f) => f.id === requested)
    : def.formats[0];
  if (!format) {
    return problem(
      400,
      `Unknown format ${JSON.stringify(requested)}. Supported: ${def.formats
        .map((f) => f.id)
        .join(', ')}`,
    );
  }

  const exportCtx: BulkExportContext = { auth: ctx.auth, plural: ctx.plural };
  const filter = params.get('filter') ?? undefined;
  // Only declared options are read, each coerced to its boolean and defaulted —
  // so a source can read every option without a presence check, and stray query
  // params are ignored.
  const options: Record<string, boolean> = {};
  for (const opt of def.options ?? []) {
    const raw = params.get(opt.id);
    options[opt.id] = raw === null ? opt.default ?? false : raw === 'true';
  }

  const source: BulkExportSource = def.source
    ? (await def.source()).source
    : defaultSource;
  const rows = await source({ ctx: exportCtx, filter, options });

  const { default: serializer } = await format.load();
  const body = await serializer.serialize(rows, exportCtx);
  // A string goes on the wire as-is; raw bytes are copied into a plain
  // ArrayBuffer so `Response` gets a valid `BodyInit` across every runtime this
  // ships on (a bare Uint8Array's buffer is typed too loosely for `BlobPart`).
  const responseBody: BodyInit =
    typeof body === 'string'
      ? body
      : new Blob([toArrayBuffer(body)], { type: format.mimeType });

  const filename = sanitizeFilename(
    params.get('filename') || `${ctx.plural}.${format.extension}`,
  );

  return new Response(responseBody, {
    status: 200,
    headers: {
      'Content-Type': format.mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      // The row set reflects live data; never let a proxy or the browser serve a
      // stale export.
      'Cache-Control': 'no-store',
    },
  });
};

export default bulkExport;

/**
 * List the resource's own collection, one row per record. The mirror of bulk
 * import's default saver (one create per row). Honors the `filter` query param —
 * which includes a record selection, since selection travels as an
 * `id in [...]` filter.
 */
const defaultSource: BulkExportSource = async ({ ctx, filter }) => {
  return serverClient(ctx.auth.token)
    .collection(ctx.plural)
    .listAll(filter ? { filter } : undefined);
};

/** Copy a byte view into a fresh, exactly-typed ArrayBuffer for `Blob`. */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

/** Strip path separators and control chars so the filename can't escape the header. */
function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>\r\n]/g, '-').trim() || 'export';
}

function problem(status: number, message: string): Response {
  return problemResponse(status, message);
}
