/**
 * Injection seam for reading a secret field's value (`secret: true` in a
 * resource's `fields`).
 *
 * No route returns a secret: the API reads one back as a descriptor. Server
 * code that *uses* one — calling a provider with a stored API key — reads it
 * in-process through here. The engine holds the values, and core can't import
 * the engine (the dependency direction is server → core), so the server hands
 * down a reader at boot, like `setHouseholdDirectory`.
 *
 * There's no caller to authorize: a secret is only as exposed as the server
 * code that reads it. Use the value for what it's for; never put it in a
 * response, a log line, or a model's context.
 */

export type SecretReader = (resource: string, path: string, field: string) => unknown;

let current: SecretReader | null = null;

/** Install the server's reader. `null` removes it. */
export function setSecretReader(reader: SecretReader | null): void {
  current = reader;
}

/**
 * The value of secret `field` on the `resource` record at `path` (e.g.
 * `credentials/abc`), or null when it's unset or the record doesn't exist.
 * Throws when no reader is installed, when the field isn't a secret, or when
 * the value can't be decrypted.
 */
export function readSecret(resource: string, path: string, field: string): unknown {
  if (!current) throw new Error('secrets are unavailable: no secret reader is installed');
  return current(resource, path, field);
}
