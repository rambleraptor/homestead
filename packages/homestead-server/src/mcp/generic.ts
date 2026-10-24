/**
 * The generic (consolidated) MCP tool surface.
 *
 * The flattest of the three surfaces (`./surface` lists them). The typed one in
 * `./register` mints four tools per resource plus one per custom method — ~167
 * tools on a stock instance, which is tens of thousands of tokens of schema in
 * every client's context and past the tool cap some clients enforce. This
 * module collapses all of it into six tools that take the resource as a
 * parameter:
 *
 *   describe_resources · read_records · create_record · update_record
 *   delete_record · run_custom_method
 *
 * Discoverability is what a generic surface usually gives up, so it's recovered
 * deliberately, in four places:
 *
 *  1. `resource` is a Zod **enum** of every exposed plural, so the full catalog
 *     rides along in each tool's input schema — the model can't miss what
 *     exists, and can't invent a resource name.
 *  2. {@link homesteadInstructions} puts a one-line-per-resource catalog in the
 *     server's initialize `instructions`, which clients hand to the model once
 *     per session.
 *  3. `describe_resources` returns the catalog (no argument) or one resource's
 *     full field schema + custom methods (with an argument).
 *  4. Errors teach: a write is validated against the *same* per-resource Zod
 *     schema the typed tools use, and a rejection names the accepted fields, so
 *     a wrong guess self-corrects in one round-trip instead of dead-ending.
 *
 * Execution is not reimplemented — a generic call is translated into the typed
 * call it stands for (`./translate`, shared with the per-resource surface) and
 * handed to `executeToolCall` / `executeCustomMethod`, so permissions,
 * reference checks, list caps, and custom-method dispatch behave identically on
 * every surface.
 *
 * When a client can afford per-resource schemas, `./per-resource` is the better
 * trade: it holds the tool count near-flat too, but keeps each resource's
 * fields typed instead of describing them on request.
 */

import { z } from 'zod';
import type {
  FieldDef,
  ResourceCustomMethod,
  ResourceDefinition,
} from '@rambleraptor/homestead-core/resources/types';
import {
  buildTools,
  FILTER_SYNTAX,
  listParamShape,
  ORDER_BY_SYNTAX,
  parentIdParam,
  pickListParams,
  snake,
  type CrudOp,
  type ToolBinding,
  type ToolSpec,
} from '@rambleraptor/homestead-core/server/chat/tools';
import { executeToolCall } from '@rambleraptor/homestead-core/server/chat/execute';
import {
  buildCustomMethodTools,
  customMethodToolName,
  executeCustomMethod,
} from '@rambleraptor/homestead-core/server/chat/custom-methods';
import type { SurfaceResult, ToolSurface } from '@rambleraptor/homestead-core/server/chat/surface';
import { toCustomMethodCall, toTypedCall } from '@rambleraptor/homestead-core/server/chat/translate';

export const DESCRIBE_TOOL = 'describe_resources';
export const READ_TOOL = 'read_records';
export const CREATE_TOOL = 'create_record';
export const UPDATE_TOOL = 'update_record';
export const DELETE_TOOL = 'delete_record';
export const CUSTOM_METHOD_TOOL = 'run_custom_method';

// ─────────────────────────────── the catalog ───────────────────────────────

/** One line of the catalog: what a resource is and how it's addressed. */
interface CatalogEntry {
  resource: string;
  singular: string;
  description?: string;
  /** Param names for the ancestor ids a call must supply, root first. */
  parent_ids?: string[];
  /** Verbs callable through `run_custom_method`. */
  custom_methods?: string[];
}

/** Describe a single field for `describe_resources`, in its authoring shape. */
function describeField(field: FieldDef): Record<string, unknown> {
  const reference = field.reference ?? (field.type === 'array' ? field.items?.reference : undefined);
  return {
    type: field.type,
    ...(field.required ? { required: true } : {}),
    ...(field.description ? { description: field.description } : {}),
    ...(field.enum?.length ? { enum: [...field.enum] } : {}),
    ...(field.format ? { format: field.format } : {}),
    ...(reference
      ? { reference: reference.resource, ...(field.type === 'array' ? { to_many: true } : {}) }
      : {}),
    // File fields are uploaded through the SPA, never through a tool call.
    ...(field.type === 'file' ? { writable: false } : {}),
  };
}

/** Describe one custom method, including its declared request schema. */
function describeCustomMethod(
  verb: string,
  method: ResourceCustomMethod,
): Record<string, unknown> {
  return {
    verb,
    target: method.target ?? 'collection',
    ...(method.description ? { description: method.description } : {}),
    ...(method.async ? { long_running: true } : {}),
    ...(method.request ? { request: method.request } : {}),
  };
}

// ────────────────────────────── the tool surface ──────────────────────────────

/** The `fields` param: a record body, keyed by the resource's field names. */
const FIELDS_PARAM = z
  .record(z.string(), z.unknown())
  .describe(
    "The record's fields, keyed by field name. Call describe_resources with this" +
      ' resource first to see which fields it accepts.',
  );

/** The `parent_ids` param: ancestor ids for a nested resource. */
const PARENT_IDS_PARAM = z
  .record(z.string(), z.string())
  .describe(
    'Ids of the ancestor records, keyed by `<parent>_id` (e.g. {"gift_card_id": "abc"}).' +
      ' Required only for nested resources — describe_resources lists which ones a' +
      ' resource needs.',
  )
  .optional();

/**
 * Build the generic surface over `defs`. `write` mirrors the typed surface's
 * scope gate: when false, only `describe_resources`, `read_records`, and `GET`
 * custom methods are exposed.
 */
export function buildGenericTools(
  defs: ResourceDefinition[],
  { write = true }: { write?: boolean } = {},
): ToolSurface {
  const { tools: typed, bindings } = buildTools(defs);
  const custom = buildCustomMethodTools(defs);
  const bySingular = new Map(defs.map((d) => [d.singular, d]));
  const byPlural = new Map(defs.map((d) => [d.plural, d]));
  const resources = defs.map((d) => d.plural);

  const unknownResource = (value: unknown): string =>
    `unknown resource "${String(value)}" — this Homestead has: ${resources.join(', ')}`;

  /** Binding for a typed CRUD tool, or null when the resource is unknown. */
  const bindingFor = (plural: string, op: CrudOp): { name: string; binding: ToolBinding } | null => {
    const def = byPlural.get(plural);
    if (!def) return null;
    const name = `${op}_${snake(def.singular)}`;
    const binding = bindings.get(name);
    return binding ? { name, binding } : null;
  };

  const catalog: CatalogEntry[] = defs.map((def) => {
    const parentIds = (bindingFor(def.plural, 'read')?.binding.parentChain ?? []).map(parentIdParam);
    const verbs = Object.keys(def.customMethods ?? {});
    return {
      resource: def.plural,
      singular: def.singular,
      ...(def.description ? { description: def.description } : {}),
      ...(parentIds.length > 0 ? { parent_ids: parentIds } : {}),
      ...(verbs.length > 0 ? { custom_methods: verbs } : {}),
    };
  });

  // The enum that carries the catalog into every tool's schema. z.enum needs a
  // non-empty tuple; an instance with no resources falls back to a bare string.
  const resourceParam = (
    resources.length > 0 ? z.enum(resources as [string, ...string[]]) : z.string()
  ).describe('Plural name of the resource, e.g. "recipes".');

  const tools: Record<string, ToolSpec> = {
    [DESCRIBE_TOOL]: {
      description:
        'Discover what this Homestead holds. With no argument, returns the catalog:' +
        ' every resource, what it is, the ancestor ids it needs, and its custom' +
        ' method verbs. With `resource`, returns that one resource in full — every' +
        ' field with its type, whether it is required, allowed values, and which' +
        ' resource a reference points at — plus its custom methods and their request' +
        ' schemas. Call this before your first write to a resource.',
      inputSchema: z.object({
        resource: resourceParam.optional(),
      }),
    },
    [READ_TOOL]: {
      description:
        'Read records. Pass `id` to fetch one record; omit it to list, optionally narrowed' +
        ' with `filter`, sorted with `order_by`, and capped with `limit`.',
      inputSchema: z.object({
        resource: resourceParam,
        id: z.string().describe('Id of one record. Omit to list records.').optional(),
        parent_ids: PARENT_IDS_PARAM,
        ...listParamShape({ brief: true }),
      }),
    },
  };

  if (write) {
    tools[CREATE_TOOL] = {
      description: 'Create one record.',
      inputSchema: z.object({
        resource: resourceParam,
        fields: FIELDS_PARAM,
        parent_ids: PARENT_IDS_PARAM,
      }),
    };
    tools[UPDATE_TOOL] = {
      description: 'Update one record. Only the fields you pass change (merge patch).',
      inputSchema: z.object({
        resource: resourceParam,
        id: z.string().describe('Id of the record to update.'),
        fields: FIELDS_PARAM,
        parent_ids: PARENT_IDS_PARAM,
      }),
    };
    tools[DELETE_TOOL] = {
      description: 'Delete one record. This cannot be undone.',
      inputSchema: z.object({
        resource: resourceParam,
        id: z.string().describe('Id of the record to delete.'),
        parent_ids: PARENT_IDS_PARAM,
      }),
    };
  }

  // Custom methods collapse into one tool the same way CRUD does. Exposed only
  // when there is something to call, and — like the typed surface — a read-only
  // authorization gets only the `GET` ones.
  const callableMethods = [...custom.bindings.values()].filter(
    (b) => write || b.httpMethod === 'GET',
  );
  if (callableMethods.length > 0) {
    const available = callableMethods.map((b) => `${b.plural}:${b.verb}`).sort();
    tools[CUSTOM_METHOD_TOOL] = {
      description:
        'Run an AEP-136 custom method — an app-specific action that is not plain CRUD.' +
        ` Available: ${available.join(', ')}.` +
        ' describe_resources reports each verb\'s target and request schema. A' +
        ' long-running method answers with an operation: poll it by reading the' +
        ' `operations` resource until `done` is true, then read its `response`.',
      inputSchema: z.object({
        resource: resourceParam,
        verb: z.string().describe('The custom method\'s verb, e.g. "classify".'),
        id: z
          .string()
          .describe('Id of the record to act on. Required for an `item`-target method.')
          .optional(),
        body: z
          .record(z.string(), z.unknown())
          .describe("The method's request body, if it takes one.")
          .optional(),
        parent_ids: PARENT_IDS_PARAM,
      }),
    };
  }

  // ───────────────────────────── execution ─────────────────────────────

  function describe(args: Record<string, unknown>): SurfaceResult {
    const plural = args.resource;
    if (plural === undefined || plural === null || plural === '') {
      return { ok: true, result: { resources: catalog } };
    }
    const def = typeof plural === 'string' ? byPlural.get(plural) : undefined;
    if (!def) return { ok: false, error: unknownResource(plural) };

    const parentChain = bindingFor(def.plural, 'read')?.binding.parentChain ?? [];
    const fields: Record<string, unknown> = {};
    for (const [name, field] of Object.entries(def.fields)) {
      // Deprecated fields are on their way out — the write tools reject them,
      // so don't advertise them either.
      if (field.deprecated) continue;
      fields[name] = describeField(field);
    }
    return {
      ok: true,
      result: {
        resource: def.plural,
        singular: def.singular,
        ...(def.description ? { description: def.description } : {}),
        parent_ids: parentChain.map((parent) => ({
          param: parentIdParam(parent),
          resource: bySingular.get(parent)?.plural ?? `${parent}s`,
        })),
        fields,
        custom_methods: Object.entries(def.customMethods ?? {}).map(([verb, method]) =>
          describeCustomMethod(verb, method),
        ),
      },
    };
  }

  /**
   * Flatten a generic call into the args its typed tool takes and validate them
   * against that tool's schema, so the caller gets the same guarantees the typed
   * surface enforces. The translation itself is shared with the per-resource
   * surface (see `./translate`) — only resolving the resource is generic's own.
   */
  function typedArgs(
    plural: string,
    op: CrudOp,
    args: Record<string, unknown>,
  ): { name: string; args: Record<string, unknown> } | { error: string } {
    const found = bindingFor(plural, op);
    if (!found) return { error: unknownResource(plural) };
    const { name, binding } = found;
    return toTypedCall(plural, name, binding, typed[name].inputSchema as z.ZodObject, {
      id: args.id,
      fields: args.fields,
      parentIds: args.parent_ids,
      list: op === 'read' ? pickListParams(args) : undefined,
    });
  }

  async function runCustomMethod(
    args: Record<string, unknown>,
    token: string,
  ): Promise<SurfaceResult> {
    const plural = typeof args.resource === 'string' ? args.resource : '';
    const def = byPlural.get(plural);
    if (!def) return { ok: false, error: unknownResource(args.resource) };
    const verb = typeof args.verb === 'string' ? args.verb : '';
    const method = def.customMethods?.[verb];
    if (!method) {
      const verbs = Object.keys(def.customMethods ?? {});
      return {
        ok: false,
        error: verbs.length
          ? `${plural} has no "${verb}" custom method — it has: ${verbs.join(', ')}`
          : `${plural} has no custom methods`,
      };
    }

    const name = customMethodToolName(def, verb, method.target ?? 'collection');
    const binding = custom.bindings.get(name);
    // The plural/verb check guards a generated name that resolved to another
    // resource's method — possible only when one resource's plural equals
    // another's singular, but better unexposed than misdispatched.
    if (!binding || binding.plural !== def.plural || binding.verb !== verb) {
      return { ok: false, error: `custom method ${plural}:${verb} is not exposed` };
    }
    if (!write && binding.httpMethod !== 'GET') {
      return { ok: false, error: `${plural}:${verb} needs write access` };
    }

    const call = toCustomMethodCall(
      plural,
      name,
      binding,
      custom.tools[name].inputSchema as z.ZodObject,
      { id: args.id, body: args.body, parentIds: args.parent_ids },
    );
    if ('error' in call) return { ok: false, error: call.error };
    return executeCustomMethod(call.name, call.args, custom.bindings, token);
  }

  async function execute(
    name: string,
    args: Record<string, unknown>,
    token: string,
  ): Promise<SurfaceResult> {
    if (name === DESCRIBE_TOOL) return describe(args);
    if (name === CUSTOM_METHOD_TOOL) return runCustomMethod(args, token);

    const op = CRUD_OP[name];
    if (!op) return { ok: false, error: `unknown tool "${name}"` };
    if (!write && op !== 'read') return { ok: false, error: `${name} needs write access` };

    const plural = typeof args.resource === 'string' ? args.resource : '';
    const translated = typedArgs(plural, op, args);
    if ('error' in translated) return { ok: false, error: translated.error };

    const out = await executeToolCall(
      { name: translated.name, args: translated.args },
      bindings,
      token,
    );
    return out.ok ? { ok: true, result: out.result } : { ok: false, error: out.error ?? 'error' };
  }

  return { tools, execute, instructions: homesteadInstructions(defs), resources };
}

/** Generic tool name → the CRUD op it stands for. */
const CRUD_OP: Record<string, CrudOp | undefined> = {
  [READ_TOOL]: 'read',
  [CREATE_TOOL]: 'create',
  [UPDATE_TOOL]: 'update',
  [DELETE_TOOL]: 'delete',
};

/**
 * The server's initialize `instructions` — the catalog the client hands the
 * model once per session, so discovery doesn't cost a tool call. Kept to one
 * line per resource; the full field schema stays behind `describe_resources`.
 */
export function homesteadInstructions(defs: ResourceDefinition[]): string {
  const lines = defs.map((def) => {
    const verbs = Object.keys(def.customMethods ?? {});
    const about = def.description ? ` — ${def.description}` : '';
    const methods = verbs.length > 0 ? ` [custom methods: ${verbs.join(', ')}]` : '';
    return `- ${def.plural}${about}${methods}`;
  });
  return [
    "This server exposes a Homestead household's data as AEP resources. Every call runs" +
      " with the signed-in user's own permissions.",
    '',
    `Use ${DESCRIBE_TOOL} with no argument for the catalog, or with a resource for its` +
      ` fields, allowed values, references, and custom methods. Reading needs no lookup;` +
      ` call ${DESCRIBE_TOOL} before your first write to a resource. Nested resources take` +
      ' their ancestor ids in `parent_ids`.',
    '',
    `A ${READ_TOOL} without an id lists; pass \`filter\`, \`order_by\`, and \`limit\` (default` +
      ' and max 100) to let the server narrow and sort instead of reading a whole collection.',
    `- filter: ${FILTER_SYNTAX}`,
    `- order_by: ${ORDER_BY_SYNTAX}`,
    '',
    'Resources:',
    ...lines,
  ].join('\n');
}
