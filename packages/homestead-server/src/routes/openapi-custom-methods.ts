/**
 * Inject app-declared AEP-136 custom methods into the engine's OpenAPI doc.
 *
 * The engine generates `/openapi.json` from its own resource registry and has
 * no knowledge of custom methods — those are a server-layer concept, declared
 * in app configs and dispatched by the `/api/aep` gateway. So the gateway
 * enriches the doc on the way out: for each registered custom method it adds a
 * `/<resource-path>:<verb>` path, mirroring how the engine already emits its
 * built-in `:download` method.
 *
 * Pure and self-contained: it reads the finished doc, reconstructs each path's
 * parameters from the existing resource path template, and mutates `paths` in
 * place. Anything it can't place (a method whose resource isn't in the doc) is
 * skipped, never thrown.
 */

import type { ResourceCustomMethod } from '@rambleraptor/homestead-core/resources/types';
import { takesUploads } from '@rambleraptor/homestead-core/resources/custom-methods/schema';
import { errResp } from '../engine/openapi';

interface OpenApiDoc {
  paths: Record<string, unknown>;
  [key: string]: unknown;
}

/** Extract the `{name}` path parameters from a path template, in order. */
function pathParamsOf(pathKey: string): Array<Record<string, unknown>> {
  const names = [...pathKey.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  return names.map((name) => ({
    in: 'path',
    name,
    required: true,
    schema: { type: 'string' },
  }));
}

/**
 * Find the base resource path a custom method attaches to. Plurals are globally
 * unique, so the collection path is the key whose final segment is the plural;
 * the item path is that key plus a single `/{…}` id segment.
 */
function findBasePath(
  paths: Record<string, unknown>,
  plural: string,
  target: 'collection' | 'item',
): string | undefined {
  const keys = Object.keys(paths);
  const collection = keys.find((k) => {
    if (k.includes(':')) return false;
    const segs = k.split('/');
    return segs[segs.length - 1] === plural;
  });
  if (!collection) return undefined;
  if (target === 'collection') return collection;

  const prefix = `${collection}/{`;
  return keys.find(
    (k) =>
      !k.includes(':') &&
      k.startsWith(prefix) &&
      /^\{[^/]+\}$/.test(k.slice(collection.length + 1)),
  );
}

/** `bulk-import` → `BulkImport`. */
function pascal(name: string): string {
  return name
    .split(/[-_]/)
    .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join('');
}

/**
 * An AEP-style operationId — the verb, then what it acts on: the plural for a
 * collection method (`BulkImportRecipes`), the singular for an item method
 * (`ClassifyDocument`, read off the item path's `{<singular>_id}` parameter).
 */
function operationId(plural: string, verb: string, basePath: string, target: 'collection' | 'item'): string {
  if (target === 'item') {
    const param = basePath.match(/\{([^}]+)_id\}$/)?.[1];
    if (param) return `${pascal(verb)}${pascal(param)}`;
  }
  return `${pascal(verb)}${pascal(plural)}`;
}

/** The request body: JSON, and multipart too when the schema takes files. */
function requestBody(schema: Record<string, unknown>): Record<string, unknown> {
  const required = Array.isArray(schema.required) && schema.required.length > 0;
  const content: Record<string, unknown> = { 'application/json': { schema } };
  if (takesUploads(schema)) {
    content['multipart/form-data'] = {
      schema: {
        type: 'object',
        description:
          'The request as JSON in the "body" part; each file in its own part, named in the body by ' +
          'an {"$upload": "<part name>"} placeholder.',
        properties: { body: schema },
        required: ['body'],
        additionalProperties: { type: 'string', format: 'binary' },
      },
      encoding: { body: { contentType: 'application/json' } },
    };
  }
  return { required, content };
}

/** The errors every custom method can answer, in the API's problem shape. */
function errorResponses(target: 'collection' | 'item', takesInput: boolean): Record<string, unknown> {
  return {
    ...(takesInput ? { '400': errResp(400, 'The request is invalid.', 'invalid request') } : {}),
    '401': errResp(401, 'Authentication is required.', 'Authentication required'),
    '403': errResp(403, 'The caller may not do this.', 'you do not have access to this resource'),
    ...(target === 'item' ? { '404': errResp(404, 'The record was not found.', 'not found') } : {}),
    default: errResp(500, 'Any other error, in the same problem shape.', 'something went wrong'),
  };
}

/**
 * Mutate `doc.paths` in place, adding one path per custom method. `methods` is
 * the `${plural}:${verb}` → definition map (declared + synthesized bulk
 * import/export), exactly as `/api/custom-methods` reports it.
 */
export function injectCustomMethods(
  doc: OpenApiDoc,
  methods: Record<string, ResourceCustomMethod>,
): OpenApiDoc {
  if (!doc || typeof doc !== 'object' || !doc.paths) return doc;
  const schemas = (doc.components as { schemas?: Record<string, unknown> } | undefined)?.schemas ?? {};
  const operationSchema = 'operation' in schemas
    ? { $ref: '#/components/schemas/operation' }
    : { type: 'object', description: 'An AEP-151 long-running operation.' };

  for (const [key, def] of Object.entries(methods)) {
    const [plural, verb] = key.split(':', 2);
    if (!plural || !verb) continue;

    const target = def.target ?? 'collection';
    const basePath = findBasePath(doc.paths, plural, target);
    if (!basePath) {
      // Resource not in the doc (e.g. not yet synced) — skip rather than emit a
      // dangling path.
      console.warn(
        `[openapi] skipping custom method ${key}: no base path for "${plural}"`,
      );
      continue;
    }

    const httpMethod = (def.method ?? 'POST').toLowerCase();
    const query = Object.entries(def.query ?? {}).map(([name, q]) => ({
      in: 'query',
      name,
      required: q.required ?? false,
      schema: q.schema,
      ...(q.description ? { description: q.description } : {}),
    }));
    const operation: Record<string, unknown> = {
      operationId: operationId(plural, verb, basePath, target),
      ...(def.title ? { summary: def.title } : {}),
      description: def.description ?? `Custom method ${verb} on ${plural}.`,
      tags: [plural],
      parameters: [...pathParamsOf(basePath), ...query],
    };

    // AEP-136: a POST custom method takes a body — an empty object when it
    // declares none — and AEP clients (aep-lib-ts) expect it described.
    if (def.request) operation.requestBody = requestBody(def.request);
    else if (httpMethod === 'post') operation.requestBody = requestBody({ type: 'object' });

    let success: Record<string, unknown>;
    if (def.async) {
      success = {
        '202': {
          description: 'Long-running operation started; poll it until done.',
          content: { 'application/json': { schema: operationSchema } },
        },
      };
      operation['x-aep-long-running-operation'] = {
        response: { schema: def.response ?? { type: 'object' } },
      };
    } else if (def.responseMediaTypes && def.responseMediaTypes.length > 0) {
      success = {
        '200': {
          description: 'The file.',
          content: Object.fromEntries(
            def.responseMediaTypes.map((type) => [type, { schema: { type: 'string', format: 'binary' } }]),
          ),
        },
      };
    } else {
      success = {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': { schema: def.response ?? { type: 'object' } },
          },
        },
      };
    }
    operation.responses = {
      ...success,
      ...errorResponses(target, !!def.request || query.length > 0),
    };

    doc.paths[`${basePath}:${verb}`] = { [httpMethod]: operation };
  }

  return doc;
}
