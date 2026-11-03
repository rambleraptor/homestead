/**
 * Error bodies follow RFC 9457 (Problem Details) so they carry the top-level
 * `type`/`status` fields AEP-193 requires, while retaining the legacy
 * `{ error: { code, message } }` envelope every existing consumer parses.
 */

import { problemResponse } from '@rambleraptor/homestead-core/resources/problem';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Throwable error carrying an HTTP status; routers map it to the envelope. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * An RFC 9457 problem-details response — the API-wide error format, shared
 * with the custom-method gateway (see `homestead-core/resources/problem`).
 */
export function errorResponse(code: number, message: string): Response {
  return problemResponse(code, message);
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function isUniqueConstraintError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('UNIQUE constraint failed') || msg.includes('unique constraint');
}
