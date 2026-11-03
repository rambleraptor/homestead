/**
 * Parsed previews, held so an import writes exactly what was previewed.
 *
 * Without this, the real import re-parses its input. That's harmless for a CSV,
 * but a parser that calls a model (recipes' social-post and screenshot formats)
 * would pay for a second call and could read the input differently the second
 * time — saving something other than what the person reviewed, or leaving their
 * selected indices pointing at rows that no longer exist.
 *
 * The parse is kept here, in server memory, rather than read back from the
 * dry run's operation record: operations are readable and creatable by every
 * household member, so a record's `response` isn't something an import should
 * trust. A preview here is reachable only by its random id, and only by the
 * person who made it, for the same collection and format.
 *
 * Single process, so memory is the whole store. A restart (or the bounds below)
 * forgets previews; the caller is told to preview again. Each preview is
 * single-use: taking it for an import removes it, so a double-click can't
 * import the same rows twice.
 */

import type { ParsedItem } from '../../resources/bulk-import/types';

/** Long enough to read a preview, untick a few rows, and click Import. */
export const PREVIEW_TTL_MS = 60 * 60 * 1000;

/** Bound on held previews; the oldest is dropped first. */
export const MAX_PREVIEWS = 64;

interface StoredPreview {
  userId: string;
  plural: string;
  format: string;
  items: ParsedItem[];
  expiresAt: number;
}

/** What a preview is for. All three must match for it to be used. */
export interface PreviewOwner {
  userId: string;
  plural: string;
  format: string;
}

const previews = new Map<string, StoredPreview>();

function purgeExpired(now: number): void {
  for (const [id, preview] of previews) {
    if (preview.expiresAt <= now) previews.delete(id);
  }
}

/** Hold a parse and return the id an import names it by. */
export function savePreview(
  owner: PreviewOwner,
  items: ParsedItem[],
  now: number = Date.now(),
): string {
  purgeExpired(now);
  // Map iteration is insertion order, so the first key is the oldest.
  while (previews.size >= MAX_PREVIEWS) {
    const oldest = previews.keys().next().value;
    if (oldest === undefined) break;
    previews.delete(oldest);
  }
  const id = crypto.randomUUID();
  previews.set(id, { ...owner, items, expiresAt: now + PREVIEW_TTL_MS });
  return id;
}

function find(id: string, owner: PreviewOwner, now: number): StoredPreview | undefined {
  const preview = previews.get(id);
  if (!preview) return undefined;
  if (preview.expiresAt <= now) {
    previews.delete(id);
    return undefined;
  }
  // Someone else's id reads as unknown, not forbidden: it says nothing about
  // whether the id exists.
  if (
    preview.userId !== owner.userId ||
    preview.plural !== owner.plural ||
    preview.format !== owner.format
  ) {
    return undefined;
  }
  return preview;
}

/** Whether `id` names a usable preview for `owner`, without using it up. */
export function hasPreview(id: string, owner: PreviewOwner, now: number = Date.now()): boolean {
  return find(id, owner, now) !== undefined;
}

/** The preview's items, removing it; undefined when it's unknown, expired, or not `owner`'s. */
export function takePreview(
  id: string,
  owner: PreviewOwner,
  now: number = Date.now(),
): ParsedItem[] | undefined {
  const preview = find(id, owner, now);
  if (!preview) return undefined;
  previews.delete(id);
  return preview.items;
}

/** Test seam: forget every preview. */
export function clearPreviews(): void {
  previews.clear();
}
