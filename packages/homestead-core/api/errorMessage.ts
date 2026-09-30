/**
 * Reduce any thrown value to a single user-facing message, understanding the
 * standardized aepbase error envelope (`{ error: { code, message } }`, surfaced
 * client-side as {@link AepbaseError}).
 *
 * Order of preference:
 *  1. The server's own `message` — engine errors are already human-readable
 *     (e.g. `missing required fields: card_number`, `resource "…" not found`),
 *     so we surface them verbatim.
 *  2. A per-code fallback when the server sent a code but no message.
 *  3. A network-error hint when `fetch()` itself rejected (offline / DNS / CORS
 *     — the browser throws a `TypeError` in that case).
 *  4. A generic catch-all.
 *
 * This is the one place error → message mapping lives; both the global
 * React-Query error handler (`queryClient.ts`) and `useToast().error()` route
 * through it so every AEP failure reads the same way across Homestead.
 */

import { AepbaseError } from './aepbase';
import { isNetworkError } from './connectivity';

/** Friendly fallbacks keyed by AEP/HTTP status, used only when the server
 *  supplied a code but no message. */
const CODE_FALLBACKS: Record<number, string> = {
  400: 'That request was invalid.',
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have permission to do that.",
  404: "That couldn't be found.",
  409: 'That conflicts with existing data.',
  413: 'That upload is too large.',
  429: 'Too many requests — please slow down and try again.',
  500: 'Something went wrong on the server. Please try again.',
  502: 'The server is unavailable. Please try again shortly.',
  503: 'The server is unavailable. Please try again shortly.',
};

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

export function getAepErrorMessage(error: unknown): string {
  if (error instanceof AepbaseError) {
    const message = error.message?.trim();
    if (message) return message;
    return CODE_FALLBACKS[error.code] ?? GENERIC_MESSAGE;
  }
  // The request never reached the server: aepbase rewraps fetch's TypeError
  // as a NetworkError (see connectivity.ts); other callers may pass it raw.
  if (isNetworkError(error) || error instanceof TypeError) {
    return 'Network error — check your connection and try again.';
  }
  if (error instanceof Error) {
    return error.message?.trim() || GENERIC_MESSAGE;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  return GENERIC_MESSAGE;
}
