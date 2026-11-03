/**
 * Client hooks for the bulk-import API.
 *
 * The browser is a thin client here: it uploads the files (multipart), the server parses them,
 * and the preview the user sees is the server's own parse — which the import
 * then writes by its `preview_id`, without uploading or parsing again. Both the preview and
 * the import run as AEP-151 operations, so each call is a `202` + a poll.
 *
 * Nothing in here is app-specific — the standardized page drives any resource
 * that declares `bulkImport`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { awaitOperation } from '@rambleraptor/homestead-core/api/operations';
import type { Operation } from '@rambleraptor/homestead-core/resources/operations';
import type {
  BulkImportFormatInfo,
  BulkImportPreview,
  BulkImportRequest,
  BulkImportResult,
} from '@rambleraptor/homestead-core/resources/bulk-import/types';

const BULK_IMPORT_VERB = 'bulk-import';

/**
 * A preview is work the user is actively waiting on, so poll faster than the
 * 1.5s default — a snappy parse shouldn't feel like a second and a half.
 */
const PREVIEW_POLL_MS = 300;

interface CustomMethodInfo {
  plural: string;
  verb: string;
  bulk_import?: { formats: BulkImportFormatInfo[] };
}

/**
 * The formats a resource accepts, from the server's discovery endpoint.
 *
 * Fetched rather than bundled: parsers are server-only (stubbed out of the
 * browser build), so the client learns what it can upload at runtime. That's
 * what lets one page serve every app with no per-app UI code.
 */
export function useBulkImportFormats(plural: string) {
  return useQuery({
    queryKey: ['bulk-import', 'formats', plural],
    // Formats only change on deploy.
    staleTime: Infinity,
    queryFn: async (): Promise<BulkImportFormatInfo[]> => {
      const res = await fetch('/api/custom-methods');
      if (!res.ok) throw new Error('Could not load import formats');
      const { methods } = (await res.json()) as { methods: CustomMethodInfo[] };
      const method = methods.find(
        (m) => m.plural === plural && m.verb === BULK_IMPORT_VERB,
      );
      return method?.bulk_import?.formats ?? [];
    },
  });
}

export interface BulkImportInputPayload {
  format: string;
  files?: File[];
  text?: string;
}

function buildRequest(
  input: BulkImportInputPayload,
  extra: Partial<BulkImportRequest>,
): BulkImportRequest {
  const base: BulkImportRequest = { format: input.format, ...extra };
  if (input.text !== undefined) return { ...base, text: input.text };
  // `customMethod` sends the files as multipart parts ($upload placeholders).
  return { ...base, files: input.files ?? [] };
}

/** Parse without writing, returning the server's candidate items. */
export function useBulkImportPreview(plural: string) {
  return useMutation({
    // The import page shows its own inline error + toast for parse failures.
    meta: { skipErrorToast: true },
    mutationFn: async (input: BulkImportInputPayload): Promise<BulkImportPreview> => {
      const body = buildRequest(input, { validate_only: true });
      const operation = await aepbase.customMethod<Operation>(
        plural,
        BULK_IMPORT_VERB,
        body,
      );
      return awaitOperation<BulkImportPreview>(operation.id, {
        intervalMs: PREVIEW_POLL_MS,
      });
    },
  });
}

export interface RunBulkImportInput {
  format: string;
  /**
   * The preview being imported. The server writes the rows it held for it
   * rather than parsing again, so the import is exactly what was shown — and a
   * parser that calls a model runs once, not twice. The input isn't re-sent.
   */
  previewId: string;
  /** Indices from that preview, or `'*'` for everything importable in it. */
  selectedIndices: number[] | '*';
}

/**
 * Write the selected items. Invalidates `queryKey` on success so the app's list
 * reflects the import without a reload.
 */
export function useBulkImportRun(plural: string, queryKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  return useMutation({
    // The import page shows its own message for full and partial failures.
    meta: { skipErrorToast: true },
    mutationFn: async (input: RunBulkImportInput): Promise<BulkImportResult> => {
      const body: BulkImportRequest = {
        format: input.format,
        preview_id: input.previewId,
        selected_indices: input.selectedIndices,
      };
      const operation = await aepbase.customMethod<Operation>(
        plural,
        BULK_IMPORT_VERB,
        body,
      );
      // No intervalMs override: a real import is background work, and the
      // operation stays visible in the (superuser-only) Operations app if the
      // user navigates away mid-import.
      return awaitOperation<BulkImportResult>(operation.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
