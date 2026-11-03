/**
 * AEP-154 preconditions: etags and the conditional headers that check them.
 *
 * Every resource carries an output-only `etag` (AEP-148 names the field; AEP-154
 * defines it): a strong, quoted, opaque hash of the resource that changes
 * whenever the resource does. Single-resource responses also send it as the
 * `ETag` header.
 *
 * - `If-Match` on a mutation (PATCH, PUT, DELETE) makes it conditional: when the
 *   resource's current etag isn't one of those given, nothing is written and
 *   the answer is 412 Precondition Failed. So a client that edited the version
 *   it last saw can't overwrite a newer one it never saw. On a read (GET), a
 *   mismatch is a 412 too.
 * - `If-None-Match` on a GET returns 304 Not Modified when the etag matches.
 * - A conditional header where none is supported (a list, a create, a custom
 *   method, `If-None-Match` on a mutation, non-resource routes) is a 400:
 *   AEP-154 forbids silently ignoring one.
 *
 * Comparison follows RFC 9110: `If-Match` compares strongly (a weak `W/` tag
 * never matches), `If-None-Match` weakly. `*` matches any current resource.
 */

import { createHash } from 'node:crypto';
import { errorResponse } from './errors';

export const IF_MATCH = 'if-match';
export const IF_NONE_MATCH = 'if-none-match';

/**
 * The etag of a resource representation. `extra` folds in what the
 * representation can't show changing — a file replaced under the same name
 * keeps its download URL — and `update_time` alone can't distinguish two
 * writes in the same second.
 */
export function computeEtag(representation: Record<string, unknown>, extra = ''): string {
  const hash = createHash('sha256').update(JSON.stringify(representation)).update('\0').update(extra);
  return `"${hash.digest('base64url').slice(0, 27)}"`;
}

/** The entity tags in an `If-Match` / `If-None-Match` value, or `*`. */
function parseTags(value: string): '*' | string[] {
  const trimmed = value.trim();
  if (trimmed === '*') return '*';
  return trimmed
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t !== '');
}

const opaque = (tag: string): string => (tag.startsWith('W/') ? tag.slice(2) : tag);

/**
 * Whether the request's `If-Match` (if any) lets it go ahead against a resource
 * whose current etag is `current` (null: there is no current resource).
 */
export function ifMatchHolds(req: Request, current: string | null): boolean {
  const header = req.headers.get(IF_MATCH);
  if (header === null) return true;
  if (current === null) return false;
  const tags = parseTags(header);
  if (tags === '*') return true;
  // Strong comparison: both must be strong and identical.
  return tags.some((t) => !t.startsWith('W/') && t === current);
}

/** Whether the request's `If-None-Match` matches `current` (weak comparison). */
export function ifNoneMatchHits(req: Request, current: string | null): boolean {
  const header = req.headers.get(IF_NONE_MATCH);
  if (header === null || current === null) return false;
  const tags = parseTags(header);
  if (tags === '*') return true;
  return tags.some((t) => opaque(t) === opaque(current));
}

export function hasConditionalHeaders(req: Request): boolean {
  return req.headers.has(IF_MATCH) || req.headers.has(IF_NONE_MATCH);
}

export function preconditionFailed(path: string): Response {
  return errorResponse(
    412,
    `resource "${path}" has changed since the version this request was based on (etag mismatch); read it again and retry`,
  );
}

/** 400 for a conditional header this operation doesn't support (AEP-154: never ignore one). */
export function unsupportedConditional(req: Request, what = 'this operation'): Response | null {
  const names = [IF_MATCH, IF_NONE_MATCH].filter((h) => req.headers.has(h));
  if (names.length === 0) return null;
  return errorResponse(400, `${names.map((n) => n.replace(/(^|-)\w/g, (c) => c.toUpperCase())).join(', ')} is not supported on ${what}`);
}

/** 304 Not Modified for a read whose `If-None-Match` matched. */
export function notModified(etag: string): Response {
  return new Response(null, { status: 304, headers: { ETag: etag } });
}

/** Add an `ETag` header to a single-resource response. */
export function withEtag(res: Response, etag: unknown): Response {
  if (typeof etag === 'string') res.headers.set('ETag', etag);
  return res;
}
