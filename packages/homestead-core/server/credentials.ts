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

/** Where a credential slot's value comes from. */
export type CredentialSource = 'env' | 'stored';

/**
 * A credential slot's value (`apps/credential-slots.ts`): its environment
 * variable when that's set, which wins, else the stored credential whose id
 * is the slot id. Null when neither is set, or when the stored value can't be
 * read — secrets unavailable, or a key that can't decrypt it — so a caller
 * treats it as not configured rather than failing.
 */
export function resolveCredential(
  slot: { id: string; env?: string },
  env: NodeJS.ProcessEnv = process.env,
): { value: string; source: CredentialSource } | null {
  const fromEnv = slot.env ? env[slot.env]?.trim() : undefined;
  if (fromEnv) return { value: fromEnv, source: 'env' };
  try {
    const stored = readCredential(slot.id)?.trim();
    return stored ? { value: stored, source: 'stored' } : null;
  } catch {
    return null;
  }
}
