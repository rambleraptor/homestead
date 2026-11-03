/**
 * JSON Schema building blocks for describing custom methods (AEP-136) — the
 * request/response schemas they declare, which `/openapi.json` publishes and
 * the model tools read.
 */

/** Marks the file placeholder schema, so a describer can tell a method takes uploads. */
export const UPLOAD_MARKER = 'x-homestead-upload';

/**
 * A file in a custom method's request body: on the wire an
 * `{ "$upload": "<part>" }` placeholder naming a multipart part (see
 * `./body`); the handler receives a `File`.
 */
export function uploadSchema(description = 'A file.'): Record<string, unknown> {
  return {
    type: 'object',
    description: `${description} Sent as a multipart part, named here by {"$upload": "<part name>"}.`,
    properties: {
      $upload: { type: 'string', description: 'Name of the multipart part holding the file.' },
    },
    required: ['$upload'],
    additionalProperties: false,
    [UPLOAD_MARKER]: true,
  };
}

/** Whether a request schema has a file anywhere in it — and so must be sent as multipart. */
export function takesUploads(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return false;
  if (Array.isArray(schema)) return schema.some(takesUploads);
  const s = schema as Record<string, unknown>;
  if (s[UPLOAD_MARKER] === true) return true;
  return Object.values(s).some(takesUploads);
}
