/**
 * Finding the bulk-import preview an approval is about.
 *
 * The assistant imports in two calls of a resource's `:bulk-import` action: a
 * `validate_only` preview (no approval), then the write naming its
 * `preview_id` — which waits on the person. The approval card lists the rows
 * that write would save, so it looks the preview up among the conversation's
 * earlier tool results.
 */

import type { BulkImportPreview, ParsedItem } from '@rambleraptor/homestead-client';
import type { HomesteadUIMessage } from './types';

/** The `:bulk-import` call's body, when this tool input is one. */
export function bulkImportBody(input: unknown): Record<string, unknown> | null {
  const { action, body } = (input ?? {}) as { action?: unknown; body?: unknown };
  if (action !== ':bulk-import' || !body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body as Record<string, unknown>;
}

function previewOf(output: unknown): BulkImportPreview | null {
  // A tool's output is `{ result }`; a bulk import's result is labelled
  // untrusted, so the preview sits under `content`.
  const result = (output as { result?: unknown } | null)?.result as
    | { content?: unknown }
    | undefined;
  const candidate = (result?.content ?? result) as Partial<BulkImportPreview> | undefined;
  return candidate && typeof candidate.preview_id === 'string' && Array.isArray(candidate.items)
    ? (candidate as BulkImportPreview)
    : null;
}

/** The preview with this id among the conversation's tool results, newest first. */
export function findImportPreview(
  messages: readonly HomesteadUIMessage[],
  previewId: string,
): BulkImportPreview | null {
  for (let m = messages.length - 1; m >= 0; m--) {
    const parts = messages[m]!.parts;
    for (let p = parts.length - 1; p >= 0; p--) {
      const part = parts[p] as { type: string; state?: string; output?: unknown };
      if (!part.type.startsWith('tool-') || part.state !== 'output-available') continue;
      const preview = previewOf(part.output);
      if (preview?.preview_id === previewId) return preview;
    }
  }
  return null;
}

/** The rows a selection picks: the listed indices, or every importable row. */
export function selectedRows(preview: BulkImportPreview, selection: unknown): ParsedItem[] {
  const importable = preview.items.filter((item) => item.errors.length === 0);
  if (!Array.isArray(selection)) return importable;
  const wanted = new Set(selection.filter((i): i is number => typeof i === 'number'));
  return preview.items.filter((item) => wanted.has(item.index));
}

/** A row's display name. */
export function rowLabel(item: ParsedItem): string {
  if (item.label) return item.label;
  const data = item.data as Record<string, unknown> | null;
  for (const key of ['title', 'name', 'merchant']) {
    if (typeof data?.[key] === 'string' && data[key]) return data[key] as string;
  }
  return `Row ${item.index + 1}`;
}
