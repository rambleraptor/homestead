/**
 * Reading a custom method's request body — the one way every method takes
 * input, files included.
 *
 * A request is either:
 *
 *  - `application/json` — the body object, or
 *  - `multipart/form-data` — the body object as JSON in a part named `body`,
 *    and one part per file. Wherever the body needs a file, it holds
 *    `{ "$upload": "<part name>" }`, at the top level or nested (a list of
 *    files, a file inside an object).
 *
 * That's the placeholder convention record writes already use for files below
 * the top level, so a client encodes both the same way (the shared client's
 * `encodeMethodBody`). The reader hands the method its body with every
 * placeholder replaced by the `File` it names — name and media type included —
 * so no method decodes base64 or parses multipart itself.
 */

import { ProblemError } from '../problem';

/** Name of the multipart part that carries the JSON body. */
export const BODY_PART = 'body';

const PLACEHOLDER = '$upload';

function isPlaceholder(value: unknown): value is { $upload: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    typeof (value as Record<string, unknown>)[PLACEHOLDER] === 'string'
  );
}

function resolvePlaceholders(value: unknown, parts: Map<string, File>, used: Set<string>): unknown {
  if (isPlaceholder(value)) {
    const name = value[PLACEHOLDER];
    const file = parts.get(name);
    if (!file) throw new ProblemError(400, `No "${name}" part for the $upload placeholder`);
    used.add(name);
    return file;
  }
  if (Array.isArray(value)) return value.map((v) => resolvePlaceholders(v, parts, used));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolvePlaceholders(v, parts, used)]),
    );
  }
  return value;
}

function asObject(parsed: unknown, where: string): Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProblemError(400, `${where} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * The request's body as an object, `$upload` placeholders resolved to `File`s.
 * An empty body is `{}`. Throws a 400/415 `ProblemError` for a malformed body,
 * a placeholder naming no part, or a part no placeholder names.
 */
export async function readMethodBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();

  if (contentType.startsWith('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch (err) {
      throw new ProblemError(400, `Invalid multipart body: ${err instanceof Error ? err.message : err}`);
    }
    let body: Record<string, unknown> = {};
    const parts = new Map<string, File>();
    for (const [name, value] of form.entries()) {
      if (name === BODY_PART && typeof value === 'string') {
        try {
          body = value.trim() ? asObject(JSON.parse(value), 'The "body" part') : {};
        } catch (err) {
          if (err instanceof ProblemError) throw err;
          throw new ProblemError(400, 'The "body" part is not valid JSON');
        }
        continue;
      }
      if (typeof value === 'string') {
        throw new ProblemError(
          400,
          `Unexpected "${name}" part: send fields in the "body" part, files as $upload parts`,
        );
      }
      parts.set(name, value);
    }
    const used = new Set<string>();
    const resolved = resolvePlaceholders(body, parts, used) as T;
    for (const name of parts.keys()) {
      if (!used.has(name)) {
        throw new ProblemError(400, `The "${name}" part isn't referenced by any $upload placeholder`);
      }
    }
    return resolved;
  }

  const text = await request.text();
  if (!text.trim()) return {} as T;
  if (contentType && !contentType.includes('json')) {
    throw new ProblemError(415, 'Send application/json, or multipart/form-data with a "body" part');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ProblemError(400, 'Request body must be JSON');
  }
  // A JSON body can't carry files; a placeholder in it names nothing.
  return resolvePlaceholders(asObject(parsed, 'The request body'), new Map(), new Set()) as T;
}
