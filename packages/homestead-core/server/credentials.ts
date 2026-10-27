/**
 * Server-side access to stored credentials (`superuser/credentials`).
 *
 * A credential's `value` is a `secret` field, so no route returns it; server
 * code that uses one — calling a provider with a stored API key — reads it here,
 * in-process, through the `readSecret` seam. Use the value for what it's for:
 * never put it in a response, a log line, or a model's context.
 */

import { readSecret } from './secrets';

/**
 * The value of the credential with id `id`, or null when there's no such
 * credential (or it has no value). Throws when secrets are unavailable — no
 * reader installed, or a value this instance's master key can't decrypt.
 */
export function readCredential(id: string): string | null {
  const value = readSecret('credential', `credentials/${id}`, 'value');
  return typeof value === 'string' ? value : null;
}
