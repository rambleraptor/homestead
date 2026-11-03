/**
 * MCP tools for AEP-136 custom methods.
 *
 * The CRUD tools in `./register` cover a resource's standard verbs, but an app's
 * interesting behavior often lives in its custom methods — `documents/{id}:classify`,
 * `notification-subscriptions/{id}:send-notification`, … An MCP client that only
 * sees create/read/update/delete can't reach any of it, so this module turns
 * every declared custom method into a tool of its own.
 *
 * Pure over the resource definitions (custom methods are declared on them), so
 * no app-registry coupling: `buildCustomMethodTools` derives the model-facing
 * surface, and `executeCustomMethod` invokes the method through the `/api/aep`
 * gateway over loopback with the caller's token — the same path the SPA and the
 * CLI take, so dispatch, auth, and AEP-151 operation bookkeeping all behave
 * identically no matter who calls.
 *
 * The synthesized `:bulk-import` joins them — it's a custom method like any
 * other, so a model imports with the same body every client sends: a
 * `validate_only` preview first, then the `preview_id` (and the rows it picked),
 * which asks the person first (`confirm: { unless: 'validate_only' }`).
 * `:bulk-export` stays out: it returns a file, and `read_*` already lists.
 *
 * A method that takes files gets them by **attachment id** on a surface that
 * has attachments (the chat: files the person attached to the conversation);
 * the executor turns each id into the upload. Without attachments (MCP), an
 * optional file field is left out and a method that requires one isn't offered.
 */

import { z } from 'zod';
import type {
  CustomMethodHttpMethod,
  CustomMethodTarget,
  ResourceCustomMethod,
  ResourceDefinition,
} from '../../resources/types';
import { encodeMethodBody } from '@rambleraptor/homestead-client';
import { aepbaseFetch } from '../aepbase';
import { takesUploads, UPLOAD_MARKER } from '../../resources/custom-methods/schema';
import { BULK_IMPORT_VERB, bulkImportMethodFrom } from '../bulk-import/method';
import { logger } from '../../utils/logger';
import {
  indexBySingular,
  parentIdParam,
  pluralOf,
  resolveParentChain,
  snake,
  type ToolSpec,
} from './tools';

/** Param carrying the addressed record id for an `item`-target method. */
const ID_PARAM = 'id';

/**
 * Param carrying the whole request body for a method that declares no `request`
 * schema. JSON-encoded as a string so the model always has a way to pass one.
 */
const BODY_PARAM = 'body';

/** Everything the executor needs to turn a tool call into a gateway request. */
export interface CustomMethodBinding {
  plural: string;
  verb: string;
  target: CustomMethodTarget;
  httpMethod: CustomMethodHttpMethod;
  /** AEP-151 long-running method: the call answers with an operation, not a result. */
  async: boolean;
  /** Ancestor singulars, root first — e.g. `['user']` for notification-subscription. */
  parentChain: string[];
  /** Plural for each `parentChain` entry, same order. */
  parentPlurals: string[];
  /** Tool params drawn from the declared `request` schema. Empty when undeclared. */
  bodyFields: Set<string>;
  /** True when the body comes from the JSON-encoded {@link BODY_PARAM} instead. */
  freeFormBody: boolean;
  /** Body fields that hold files, taken as attachment ids: one id, or a list. */
  uploadFields?: Map<string, 'one' | 'many'>;
  /** Where an untrusted result came from (`ResourceCustomMethod.untrustedResult`). */
  untrusted?: string;
}

/** Resolves an attachment id (a file the person attached to the conversation) to the file. */
export type AttachmentFiles = (id: string) => Promise<File>;

export interface BuiltCustomMethodTools {
  tools: Record<string, ToolSpec>;
  bindings: Map<string, CustomMethodBinding>;
}

/** A JSON Schema node, as declared on a custom method's `request`. */
type JsonSchema = Record<string, unknown>;

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * Convert one JSON Schema node to Zod, so the MCP SDK can re-emit it as the
 * tool's input schema and validate calls against it. Deliberately partial —
 * declared request schemas are simple field maps, and anything unrecognized
 * degrades to `unknown` (passed through untouched) rather than being rejected.
 */
function schemaToZod(schema: JsonSchema): z.ZodTypeAny {
  const description = typeof schema.description === 'string' ? schema.description : undefined;
  const describe = <T extends z.ZodTypeAny>(zod: T): T =>
    (description ? zod.describe(description) : zod) as T;

  const values = stringsOf(schema.enum);
  if (values.length > 0) {
    return describe(z.enum(values as [string, ...string[]]));
  }

  const options = Array.isArray(schema.oneOf) ? schema.oneOf.filter(isSchema) : [];
  if (options.length >= 2) {
    const [a, b, ...rest] = options.map(schemaToZod);
    return describe(z.union([a!, b!, ...rest]));
  }

  switch (schema.type) {
    case 'string':
      return describe(z.string());
    case 'number':
      return describe(z.number());
    case 'integer':
      return describe(z.number().int());
    case 'boolean':
      return describe(z.boolean());
    case 'array':
      return describe(z.array(isSchema(schema.items) ? schemaToZod(schema.items) : z.unknown()));
    case 'object': {
      const shape = objectShape(schema);
      // A free-form object (no declared properties) stays open rather than
      // becoming an empty — and therefore unfillable — object.
      return describe(shape ? z.object(shape) : z.record(z.string(), z.unknown()));
    }
    default:
      return describe(z.unknown());
  }
}

/**
 * The Zod shape for an object schema's `properties`, with `required` applied.
 * Returns null when the schema declares no properties (a free-form object).
 */
function objectShape(schema: JsonSchema): Record<string, z.ZodTypeAny> | null {
  if (!isSchema(schema.properties)) return null;
  const entries = Object.entries(schema.properties);
  if (entries.length === 0) return null;
  const required = new Set(stringsOf(schema.required));
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of entries) {
    if (!isSchema(value)) continue;
    const zod = schemaToZod(value);
    shape[key] = required.has(key) ? zod : zod.optional();
  }
  return Object.keys(shape).length > 0 ? shape : null;
}

/**
 * Tool name for a custom method, mirroring how the CRUD tools read: the verb
 * followed by what it addresses — the singular for an `item` method
 * (`classify_document`), the plural for a `collection` one
 * (`process_image_groceries`).
 */
export function customMethodToolName(
  def: ResourceDefinition,
  verb: string,
  target: CustomMethodTarget,
): string {
  return snake(`${verb}_${target === 'item' ? def.singular : def.plural}`);
}

/** Build the model-facing description for one custom method. */
function describeMethod(
  def: ResourceDefinition,
  verb: string,
  method: ResourceCustomMethod,
  parentPlurals: string[],
  target: CustomMethodTarget,
): string {
  const what =
    method.description ??
    `Run the "${verb}" custom method on ${target === 'item' ? `a ${def.singular}` : def.plural}.`;
  const nesting =
    parentPlurals.length > 0 ? ` Nested under: ${parentPlurals.join(' → ')}.` : '';
  // An async method answers with the operation, not the result — say so, since
  // the model has to poll for the outcome instead of reading it off the reply.
  const lro = method.async
    ? ` Long-running: the call waits up to ${LRO_WAIT_MS / 1000}s for the result; if it isn't` +
      ' done by then it returns the AEP-151 operation — poll read_operation with its id until' +
      ' `done` is true, then read its `response`.'
    : '';
  return `${what}${nesting}${lro}`;
}

/** How long a tool call waits on a long-running method before handing back the operation. */
export const LRO_WAIT_MS = 90_000;
const LRO_POLL_MS = 500;

/**
 * The custom methods a resource exposes to the model tools: its declared ones,
 * plus the synthesized `:bulk-import` when it declares `bulkImport`.
 */
export function methodsOf(def: ResourceDefinition): Array<[string, ResourceCustomMethod]> {
  const declared = Object.entries(def.customMethods ?? {});
  return def.bulkImport
    ? [...declared, [BULK_IMPORT_VERB, bulkImportMethodFrom(def.plural, def.bulkImport)]]
    : declared;
}

function isUpload(schema: unknown): boolean {
  return isSchema(schema) && schema[UPLOAD_MARKER] === true;
}

/**
 * A request schema as the model tools offer it. Top-level file fields become
 * attachment ids when the surface has attachments; otherwise optional ones are
 * dropped. Null when the method can't be offered: a required file without
 * attachments, or a file below the top level.
 */
function toolRequest(
  request: JsonSchema,
  files: boolean,
): { schema: JsonSchema; uploads: Map<string, 'one' | 'many'> } | null {
  if (!isSchema(request.properties)) return { schema: request, uploads: new Map() };
  const required = new Set(stringsOf(request.required));
  const properties: Record<string, unknown> = {};
  const uploads = new Map<string, 'one' | 'many'>();
  const attachmentId = (about: unknown) => ({
    type: 'string',
    description:
      'The attachment id of a file the person attached to this conversation' +
      (typeof about === 'string' ? ` — ${about}` : '.'),
  });
  for (const [key, value] of Object.entries(request.properties)) {
    const many = isSchema(value) && value.type === 'array' && isUpload(value.items);
    if (isUpload(value) || many) {
      if (!files) {
        if (required.has(key)) return null;
        continue;
      }
      uploads.set(key, many ? 'many' : 'one');
      properties[key] = many
        ? {
            type: 'array',
            items: attachmentId(undefined),
            description: `${(value as JsonSchema).description ?? 'Files.'} By attachment id.`,
          }
        : attachmentId((value as JsonSchema).description);
      continue;
    }
    properties[key] = value;
  }
  const schema: JsonSchema = {
    ...request,
    properties,
    required: [...required].filter((k) => k in properties),
  };
  // A file somewhere deeper can't be expressed as an attachment id here.
  if (takesUploads(schema)) return null;
  return { schema, uploads };
}

/**
 * Build one tool per declared custom method across `defs`, plus the bindings
 * {@link executeCustomMethod} needs. `taken` names tools already registered
 * (the CRUD + search tools); a custom method whose name collides with one of
 * those is skipped rather than silently shadowing it.
 */
export function buildCustomMethodTools(
  defs: ResourceDefinition[],
  taken: ReadonlySet<string> = new Set(),
  { files = false }: {
    /** The surface resolves attachment ids to files (the chat); without it, file fields are left out. */
    files?: boolean;
  } = {},
): BuiltCustomMethodTools {
  const bySingular = indexBySingular(defs);
  const tools: Record<string, ToolSpec> = {};
  const bindings = new Map<string, CustomMethodBinding>();

  for (const def of defs) {
    const parentChain = resolveParentChain(def, bySingular);
    const parentPlurals = parentChain.map((s) => pluralOf(s, bySingular));

    for (const [verb, method] of methodsOf(def)) {
      const request = isSchema(method.request) ? toolRequest(method.request, files) : undefined;
      // A method whose files this surface can't hand over isn't offered.
      if (request === null) continue;

      const target = method.target ?? 'collection';
      const name = customMethodToolName(def, verb, target);
      if (taken.has(name) || name in tools) {
        logger.warn(
          `tools: skipping custom method ${def.plural}:${verb}: tool name "${name}" is already registered`,
        );
        continue;
      }

      // Required id param per ancestor, e.g. user_id for notification-subscriptions.
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [i, parent] of parentChain.entries()) {
        shape[parentIdParam(parent)] = z
          .string()
          .describe(`id of the parent ${parentPlurals[i]} record`);
      }
      if (target === 'item') {
        shape[ID_PARAM] = z.string().describe(`id of the ${def.singular} record`);
      }

      // A declared request schema becomes typed params; without one, the body
      // is opaque, so offer a single JSON-encoded escape hatch.
      const bodyShape = request ? objectShape(request.schema) : null;
      const freeFormBody = bodyShape === null;
      if (bodyShape) {
        for (const [key, zod] of Object.entries(bodyShape)) {
          // Path params win: a body field of the same name would be unreachable.
          if (key in shape) continue;
          shape[key] = zod;
        }
      } else if (method.method !== 'GET') {
        shape[BODY_PARAM] = z
          .string()
          .describe(
            'Request body as a JSON-encoded object. This method does not declare a' +
              ' request schema — omit unless you know the shape it expects.',
          )
          .optional();
      }

      tools[name] = {
        description: describeMethod(def, verb, method, parentPlurals, target),
        inputSchema: z.object(shape),
      };
      bindings.set(name, {
        plural: def.plural,
        verb,
        target,
        httpMethod: method.method ?? 'POST',
        async: method.async ?? false,
        parentChain,
        parentPlurals,
        bodyFields: new Set(bodyShape ? Object.keys(bodyShape) : []),
        freeFormBody,
        uploadFields: request?.uploads,
        untrusted: method.untrustedResult,
      });
    }
  }

  return { tools, bindings };
}

/** Outcome of a custom-method tool call; never thrown, always reported. */
export type CustomMethodResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Build the gateway path for a call: the parent chain, the collection, the
 * addressed id for an item method, then the `:verb` suffix.
 */
function buildPath(binding: CustomMethodBinding, args: Record<string, unknown>): string {
  const segments: string[] = [];
  for (const [i, parent] of binding.parentChain.entries()) {
    const param = parentIdParam(parent);
    const id = stringArg(args[param]);
    if (!id) throw new Error(`missing required parameter "${param}"`);
    segments.push(binding.parentPlurals[i], encodeURIComponent(id));
  }
  segments.push(binding.plural);
  if (binding.target === 'item') {
    const id = stringArg(args[ID_PARAM]);
    if (!id) throw new Error(`missing required parameter "${ID_PARAM}"`);
    segments.push(encodeURIComponent(id));
  }
  return `/${segments.join('/')}:${binding.verb}`;
}

/**
 * Assemble the request body: the declared fields the caller supplied, or the
 * JSON-decoded free-form `body` param. Returns undefined when there's nothing
 * to send, so a bare call stays a bare call (several handlers treat a missing
 * body as "use the defaults").
 */
function buildBody(
  binding: CustomMethodBinding,
  args: Record<string, unknown>,
): unknown {
  if (binding.freeFormBody) {
    const raw = args[BODY_PARAM];
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (typeof raw !== 'string') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`parameter "${BODY_PARAM}" must be a valid JSON string`);
    }
  }
  const body: Record<string, unknown> = {};
  for (const field of binding.bodyFields) {
    if (args[field] === undefined) continue;
    body[field] = args[field];
  }
  return Object.keys(body).length > 0 ? body : undefined;
}

/** Parse a response body as JSON, falling back to the raw text. */
function parseBody(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Replace attachment ids in the body's file fields with the files they name. */
async function resolveUploads(
  binding: CustomMethodBinding,
  body: unknown,
  attachments: AttachmentFiles | undefined,
): Promise<unknown> {
  if (!binding.uploadFields?.size || !body || typeof body !== 'object') return body;
  const out = { ...(body as Record<string, unknown>) };
  for (const [field, kind] of binding.uploadFields) {
    const value = out[field];
    if (value === undefined) continue;
    const ids = kind === 'one' ? [value] : value;
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && id)) {
      throw new Error(`"${field}" takes ${kind === 'one' ? 'an attachment id' : 'a list of attachment ids'}`);
    }
    if (!attachments) throw new Error(`"${field}" takes files, which can only be attached in the chat`);
    const files = await Promise.all((ids as string[]).map((id) => attachments(id)));
    out[field] = kind === 'one' ? files[0] : files;
  }
  return out;
}

/** Wait (bounded) for a long-running method's operation; the operation itself if it isn't done in time. */
async function awaitOperation(operation: { id: string }, token: string): Promise<CustomMethodResult> {
  const deadline = Date.now() + LRO_WAIT_MS;
  for (;;) {
    const res = await aepbaseFetch(`/operations/${encodeURIComponent(operation.id)}`, { token });
    const op = parseBody(await res.text()) as {
      done?: boolean;
      response?: unknown;
      error?: { detail?: unknown };
    } | null;
    if (!res.ok || !op) return { ok: false, error: `could not read operation ${operation.id}` };
    if (op.done) {
      if (op.error) {
        const detail = typeof op.error.detail === 'string' ? op.error.detail : JSON.stringify(op.error);
        return { ok: false, error: `operation ${operation.id} failed: ${detail}` };
      }
      return { ok: true, result: op.response ?? null };
    }
    if (Date.now() >= deadline) {
      return {
        ok: true,
        result: { ...op, note: 'Still running — poll read_operation with this id for the result.' },
      };
    }
    await new Promise((r) => setTimeout(r, LRO_POLL_MS));
  }
}

/**
 * Invoke a custom method through the `/api/aep` gateway under `token`, so the
 * caller's own permissions apply — the body as JSON, or multipart when it
 * carries files (attachment ids resolved through `attachments`). A
 * long-running method is awaited for up to {@link LRO_WAIT_MS}. Never throws: a
 * bad argument or a failing method comes back as `{ ok: false, error }` for the
 * model to act on.
 */
export async function executeCustomMethod(
  name: string,
  args: Record<string, unknown>,
  bindings: Map<string, CustomMethodBinding>,
  token: string,
  { attachments }: { attachments?: AttachmentFiles } = {},
): Promise<CustomMethodResult> {
  const binding = bindings.get(name);
  if (!binding) return { ok: false, error: `unknown tool "${name}"` };

  try {
    const path = buildPath(binding, args);
    const body = await resolveUploads(binding, buildBody(binding, args), attachments);
    const res = await aepbaseFetch(path, {
      token,
      method: binding.httpMethod,
      body:
        body && typeof body === 'object' && !Array.isArray(body)
          ? encodeMethodBody(body as Record<string, unknown>)
          : body,
    });
    const parsed = parseBody(await res.text());
    if (!res.ok) {
      const detail = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      return {
        ok: false,
        error: `${binding.plural}:${binding.verb} failed (${res.status}): ${detail}`,
      };
    }
    const id = (parsed as { id?: unknown } | null)?.id;
    const out =
      binding.async && res.status === 202 && typeof id === 'string'
        ? await awaitOperation({ id }, token)
        : ({ ok: true, result: parsed } as const);
    // Content from outside the household is labelled, so instructions inside
    // it read as data (as outside MCP tools' results are).
    if (out.ok && binding.untrusted) {
      return { ok: true, result: { untrusted: true, source: binding.untrusted, content: out.result } };
    }
    return out;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
