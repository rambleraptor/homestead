/**
 * Client hooks for the bulk-export API.
 *
 * Export is a plain authenticated GET that streams a file back, so the browser
 * can't just point an `<a href>` at it (the bearer token wouldn't ride along) —
 * it fetches the blob, blob-URLs it, and clicks a throwaway anchor, the same
 * shape the Documents app uses for its file downloads.
 *
 * Nothing in here is app-specific — one button drives any resource that
 * declares `bulkExport`.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { authorizedFetch, authStore } from '@rambleraptor/homestead-core/api/aepbase';
import type {
  BulkExportFormatInfo,
  BulkExportOption,
} from '@rambleraptor/homestead-core/resources/bulk-export/types';

const BULK_EXPORT_VERB = 'bulk-export';
const AEP_BASE = '/api/aep';

interface BulkExportInfo {
  formats: BulkExportFormatInfo[];
  options: BulkExportOption[];
}

interface CustomMethodInfo {
  plural: string;
  verb: string;
  bulk_export?: Partial<BulkExportInfo>;
}

/**
 * A resource's bulk-export metadata (formats + options) from the server's
 * discovery endpoint. Fetched rather than bundled — the (de)serializers are
 * server-only — so the screen learns what it can offer at runtime. The two
 * hooks below `select` off this one query, so they share a single fetch.
 */
function useBulkExportInfo<T>(plural: string, select: (info: BulkExportInfo) => T) {
  return useQuery({
    queryKey: ['bulk-export', 'info', plural],
    // Metadata only changes on deploy.
    staleTime: Infinity,
    queryFn: async (): Promise<BulkExportInfo> => {
      const res = await fetch('/api/custom-methods');
      if (!res.ok) throw new Error('Could not load export metadata');
      const { methods } = (await res.json()) as { methods: CustomMethodInfo[] };
      const method = methods.find(
        (m) => m.plural === plural && m.verb === BULK_EXPORT_VERB,
      );
      return {
        formats: method?.bulk_export?.formats ?? [],
        options: method?.bulk_export?.options ?? [],
      };
    },
    select,
  });
}

/** The formats a resource can be exported to. */
export function useBulkExportFormats(plural: string) {
  return useBulkExportInfo(plural, (info) => info.formats);
}

/** The export toggles a resource declares (e.g. "combine households"). */
export function useBulkExportOptions(plural: string) {
  return useBulkExportInfo(plural, (info) => info.options);
}

export interface BulkExportInput {
  /** Format id to export; defaults to the resource's first declared format. */
  format?: string;
  /**
   * aepbase list-filter passed to the source; omit for everything. An explicit
   * record selection travels here as `id in ["a", "b", ...]` — see
   * {@link selectionFilter}.
   */
  filter?: string;
  /** Values for the resource's declared export options, keyed by option id. */
  options?: Record<string, boolean>;
  /** Override the download filename; defaults to what the server names it. */
  filename?: string;
}

/**
 * Build the list-filter that selects an explicit set of records by id:
 * `id in ["a", "b"]`. The engine's `id` column is filterable and its `in`
 * operator takes a list literal, so a checkbox selection needs no bespoke API —
 * it's just a filter. Returns undefined for an empty selection (nothing to
 * export). Ids are server-generated and quote-free, so they slot straight into
 * the CEL string literals.
 */
export function selectionFilter(ids: string[]): string | undefined {
  if (ids.length === 0) return undefined;
  return `id in [${ids.map((id) => `"${id}"`).join(', ')}]`;
}

/** Pull the filename out of a `Content-Disposition: attachment; filename="…"`. */
function filenameFromDisposition(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = /filename="?([^"]+)"?/.exec(header);
  return match?.[1];
}

/**
 * Download the export file for `plural`. Streams the authenticated GET into a
 * blob and saves it to disk under the server-provided filename.
 */
export function useBulkExport(plural: string) {
  return useMutation({
    mutationFn: async (input: BulkExportInput = {}): Promise<void> => {
      const params = new URLSearchParams();
      if (input.format) params.set('format', input.format);
      if (input.filter) params.set('filter', input.filter);
      for (const [id, value] of Object.entries(input.options ?? {})) {
        params.set(id, String(value));
      }
      if (input.filename) params.set('filename', input.filename);
      const qs = params.toString();
      const url = `${AEP_BASE}/${plural}:${BULK_EXPORT_VERB}${qs ? `?${qs}` : ''}`;

      // The gateway authenticates custom methods via bearer + X-User-Id.
      const headers: Record<string, string> = {};
      const userId = authStore.model?.id;
      if (userId) headers['X-User-Id'] = userId;

      const res = await authorizedFetch(url, { headers });
      if (!res.ok) {
        let message = `Export failed (HTTP ${res.status})`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) message = body.message;
        } catch {
          // Non-JSON error body — keep the status message.
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download =
          input.filename ??
          filenameFromDisposition(res.headers.get('Content-Disposition')) ??
          `${plural}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    },
  });
}
