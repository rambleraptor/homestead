/**
 * The per-resource tool surface: **one tool per resource**, with the verb as an
 * `action` parameter. It is what the AI chat (`./handler`) hands its model, and
 * one of the three surfaces `/api/mcp` can serve
 * (`homestead-server/src/mcp/register.ts`).
 *
 * The typed surface (`buildTools` in `./tools`, registered directly by the MCP
 * route) fans out on *verb × resource* — four tools
 * per resource plus one per custom method, ~167 on a stock instance. But the
 * verb axis is the one that carries almost no information (`delete_gift_card`
 * and `delete_recipe` differ only in a name), while the expensive axis — the
 * field set — gets emitted *twice* per resource, since `create_x` and
 * `update_x` both enumerate every field. The generic surface
 * (`homestead-server/src/mcp/generic.ts`) fixes the count by
 * collapsing to six tools, but pays for it by making the record body an
 * untyped `Record<string, unknown>`.
 *
 * This surface drops the uninformative axis and keeps the informative one:
 *
 *   gift_cards({ action: 'create', fields: { merchant: 'Target', amount: 25 } })
 *
 * ~41 tools, each carrying its own resource's real field schema — types,
 * enums, descriptions, reference hints — emitted once. Cheaper than `typed` on
 * both axes, and unlike `generic` the model can see what a field *is* at the
 * moment it composes the call.
 *
 * Three details carry the design (see
 * `packages/homestead-site/docs/design/mcp-tool-surfaces.md`):
 *
 *  1. **Custom methods join the `action` enum in AEP's `:verb` notation** —
 *     `:classify`, `:process-image`. Beyond reading like the API it stands for,
 *     the colon makes collisions impossible: a resource declaring a custom
 *     method named `list` or `delete` cannot shadow a CRUD action, so this
 *     surface needs none of the name-collision defense the typed one does.
 *  2. **Parent ids stay statically typed.** Every action on a nested resource
 *     needs its ancestor path — `list` included — so they are required
 *     top-level params, not an opaque record the model has to be told about.
 *  3. **Requiredness that varies by action moves to the executor.** One schema
 *     serves every action, so `create`'s required fields can't be expressed in
 *     JSON Schema. They are stated in the description and enforced here, with
 *     rejections that name what was accepted.
 *
 * Execution is not reimplemented: a call is translated into the typed call it
 * stands for (`./translate`) and handed to `executeToolCall` /
 * `executeCustomMethod`, so permissions, reference checks, list caps, and
 * custom-method dispatch behave identically on every surface.
 */

import { z } from 'zod';
import type {
  ResourceCustomMethod,
  ResourceDefinition,
} from '../../resources/types';
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
} from './tools';
import { executeToolCall } from './execute';
import {
  buildCustomMethodTools,
  customMethodToolName,
  executeCustomMethod,
  type CustomMethodBinding,
} from './custom-methods';
import type { SurfaceResult, ToolSurface } from './surface';
import { isRecord, toCustomMethodCall, toTypedCall } from './translate';

/** The CRUD actions, in the order they appear in the enum. */
const READ_ACTIONS = ['list', 'get'] as const;
const WRITE_ACTIONS = ['create', 'update', 'delete'] as const;

/** Action → the CRUD op it executes as. `list` and `get` share one binding. */
const CRUD_OP: Record<string, CrudOp | undefined> = {
  list: 'read',
  get: 'read',
  create: 'create',
  update: 'update',
  delete: 'delete',
};

/** Custom-method actions are the verb in AEP notation, so they can't collide. */
const verbAction = (verb: string): string => `:${verb}`;

/** One resource's tool: its schema, and everything executing a call needs. */
interface ResourceTool {
  def: ResourceDefinition;
  /** Every accepted `action` value, CRUD first then `:verb`s. */
  actions: string[];
  /** Ancestor id params, root first — required for every action. */
  parentParams: string[];
  /** Fields accepted in `fields`, in declaration order. */
  bodyFields: string[];
  /** The subset of `bodyFields` a create must supply. */
  requiredFields: string[];
  /** Custom method bindings by their `:verb` action. */
  verbs: Map<string, { toolName: string; binding: CustomMethodBinding }>;
}

/**
 * Build the per-resource surface over `defs`. `write` mirrors the other
 * surfaces' scope gate — but here it narrows each tool's `action` enum rather
 * than withholding tools, since the tool *is* the resource. A read-only
 * surface is therefore self-describing: the model sees an enum with no write
 * actions in it instead of inferring the restriction from absent tools.
 */
export function buildResourceTools(
  defs: ResourceDefinition[],
  { write = true }: { write?: boolean } = {},
): ToolSurface {
  const { tools: typed, bindings } = buildTools(defs);
  const custom = buildCustomMethodTools(defs);

  const tools: Record<string, ToolSpec> = {};
  const byTool = new Map<string, ResourceTool>();

  for (const def of defs) {
    const readBinding = bindings.get(`read_${snake(def.singular)}`);
    // Every def buildTools saw produces all four tools; a missing one means the
    // definition never made it in, so there is nothing to expose.
    if (!readBinding) continue;

    const parentParams = readBinding.parentChain.map(parentIdParam);
    const bodyFields = [...readBinding.bodyFields];
    const requiredFields = Object.entries(def.fields)
      .filter(([key, field]) => field.required && readBinding.bodyFields.has(key))
      .map(([key]) => key);

    // Custom methods this surface will accept: all of them, or only the `GET`
    // ones when the authorization is read-only.
    const verbs = new Map<string, { toolName: string; binding: CustomMethodBinding }>();
    for (const [verb, method] of Object.entries(def.customMethods ?? {})) {
      const toolName = customMethodToolName(def, verb, method.target ?? 'collection');
      const binding = custom.bindings.get(toolName);
      // Guard against a generated name that resolved to another resource's
      // method (possible only when one resource's plural equals another's
      // singular) — better unexposed than dispatched to the wrong place.
      if (!binding || binding.plural !== def.plural || binding.verb !== verb) continue;
      if (!write && binding.httpMethod !== 'GET') continue;
      verbs.set(verbAction(verb), { toolName, binding });
    }

    const actions = [
      ...READ_ACTIONS,
      ...(write ? WRITE_ACTIONS : []),
      ...verbs.keys(),
    ];

    tools[snake(def.plural)] = {
      description: describeResource(def, {
        actions,
        parentPlurals: readBinding.parentPlurals,
        requiredFields,
        verbs,
        write,
      }),
      inputSchema: buildInputSchema(def, {
        actions,
        readBinding,
        parentParams,
        bodyFields,
        typedUpdateShape: updateShapeOf(typed, def),
        hasVerbs: verbs.size > 0,
      }),
    };
    byTool.set(snake(def.plural), {
      def,
      actions,
      parentParams,
      bodyFields,
      requiredFields,
      verbs,
    });
  }

  async function execute(
    name: string,
    args: Record<string, unknown>,
    token: string,
  ): Promise<SurfaceResult> {
    const tool = byTool.get(name);
    if (!tool) return { ok: false, error: `unknown tool "${name}"` };

    const { def } = tool;
    const action = typeof args.action === 'string' ? args.action : '';
    if (!tool.actions.includes(action)) {
      return {
        ok: false,
        error:
          `unknown action ${action ? `"${action}"` : '(missing)'} on ${def.plural}` +
          ` — it has: ${tool.actions.join(', ')}`,
      };
    }

    const parentIds = collectParentIds(tool, args);
    if ('error' in parentIds) return { ok: false, error: parentIds.error };

    const id = typeof args.id === 'string' && args.id ? args.id : undefined;

    const verb = tool.verbs.get(action);
    if (verb) {
      if (verb.binding.target === 'item' && !id) {
        return { ok: false, error: `${def.plural}: action "${action}" needs "id"` };
      }
      const call = toCustomMethodCall(
        def.plural,
        verb.toolName,
        verb.binding,
        custom.tools[verb.toolName].inputSchema as z.ZodObject,
        { id, body: args.body, parentIds: parentIds.ids },
      );
      if ('error' in call) return { ok: false, error: call.error };
      return executeCustomMethod(call.name, call.args, custom.bindings, token);
    }

    const op = CRUD_OP[action];
    // Unreachable: `action` was checked against `tool.actions`, which only ever
    // holds CRUD actions and `:verb`s, and the latter were handled above.
    if (!op) return { ok: false, error: `unknown action "${action}" on ${def.plural}` };

    const precheck = checkCrudArgs(tool, action, id, args.fields);
    if (precheck) return { ok: false, error: precheck };

    const toolName = `${op}_${snake(def.singular)}`;
    const binding = bindings.get(toolName);
    if (!binding) return { ok: false, error: `${def.plural}: action "${action}" is not available` };

    const call = toTypedCall(
      def.plural,
      toolName,
      binding,
      typed[toolName].inputSchema as z.ZodObject,
      // `list` is `read` without an id; `get` is `read` with one. Only a
      // list carries filter / order_by / limit — on any other action they
      // are meaningless, so they are dropped rather than validated.
      {
        id: action === 'list' ? undefined : id,
        fields: args.fields,
        parentIds: parentIds.ids,
        list: action === 'list' ? pickListParams(args) : undefined,
      },
    );
    if ('error' in call) return { ok: false, error: call.error };

    const out = await executeToolCall({ name: call.name, args: call.args }, bindings, token);
    return out.ok ? { ok: true, result: out.result } : { ok: false, error: out.error ?? 'error' };
  }

  return {
    tools,
    execute,
    instructions: resourceInstructions(),
    resources: defs.map((d) => d.plural),
  };
}

// ─────────────────────────────── the schema ───────────────────────────────

/**
 * The `update` tool's shape for a definition: every field, all optional. Reused
 * verbatim as the `fields` shape rather than re-deriving Zod schemas from the
 * declarations, so a field types identically on every surface by construction.
 * Requiredness is deliberately not taken from `create` — one schema serves five
 * actions, and `create`'s requirements are enforced in {@link checkCrudArgs}.
 */
function updateShapeOf(
  typed: Record<string, ToolSpec>,
  def: ResourceDefinition,
): Record<string, z.ZodTypeAny> {
  const spec = typed[`update_${snake(def.singular)}`];
  return spec ? (spec.inputSchema as z.ZodObject).shape : {};
}

function buildInputSchema(
  def: ResourceDefinition,
  opts: {
    actions: string[];
    readBinding: ToolBinding;
    parentParams: string[];
    bodyFields: string[];
    typedUpdateShape: Record<string, z.ZodTypeAny>;
    hasVerbs: boolean;
  },
): z.ZodObject {
  const shape: Record<string, z.ZodTypeAny> = {
    action: z
      .enum(opts.actions as [string, ...string[]])
      .describe(`What to do with ${def.plural}.`),
  };

  // Ancestor ids: required, because every action needs the full path.
  for (const [i, param] of opts.parentParams.entries()) {
    shape[param] = z
      .string()
      .describe(`id of the parent ${opts.readBinding.parentPlurals[i]} record`);
  }

  shape.id = z
    .string()
    .describe(
      `id of the ${def.singular} record. Required for get, update, delete, and` +
        ' custom methods that act on one record; omit for list and create.',
    )
    .optional();

  // List options, `list` only. Brief descriptions: the grammar is stated once
  // in the surface instructions rather than once per resource.
  Object.assign(shape, listParamShape({ brief: true }));

  if (opts.bodyFields.length > 0) {
    const fields: Record<string, z.ZodTypeAny> = {};
    for (const key of opts.bodyFields) {
      const schema = opts.typedUpdateShape[key];
      if (schema) fields[key] = schema;
    }
    shape.fields = z
      .object(fields)
      .describe("The record's fields. Required for create and update.")
      .optional();
  }

  if (opts.hasVerbs) {
    shape.body = z
      .record(z.string(), z.unknown())
      .describe("A custom method's request body. Only used by the `:verb` actions.")
      .optional();
  }

  return z.object(shape);
}

// ────────────────────────────── the description ──────────────────────────────

/** Render one custom method as a line of the tool description. */
function verbLine(
  action: string,
  method: ResourceCustomMethod,
  binding: CustomMethodBinding,
): string {
  const needs: string[] = [];
  if (binding.target === 'item') needs.push('id');
  if (binding.bodyFields.size > 0) {
    needs.push(`body: ${[...binding.bodyFields].join(', ')}`);
  } else if (binding.freeFormBody && binding.httpMethod !== 'GET') {
    // No declared request schema, so the body is opaque — say so rather than
    // implying the method takes nothing.
    needs.push('body: free-form JSON');
  }
  const args = needs.length > 0 ? ` (needs ${needs.join('; ')})` : '';
  const about = method.description ? ` — ${method.description}` : '';
  // An async method answers with the operation, not the result, so the model
  // has to poll rather than read the outcome off the reply.
  const lro = method.async
    ? ' Long-running: returns an AEP-151 operation; poll the `operations` resource' +
      ' with the returned id until `done` is true, then read its `response`.'
    : '';
  return `- ${action}${args}${about}${lro}`;
}

function describeResource(
  def: ResourceDefinition,
  opts: {
    actions: string[];
    parentPlurals: string[];
    requiredFields: string[];
    verbs: Map<string, { toolName: string; binding: CustomMethodBinding }>;
    write: boolean;
  },
): string {
  const lines: string[] = [def.description ?? `The ${def.plural} collection.`];

  // Spell out what each CRUD action needs; the schema can't say, since one
  // schema serves them all.
  const crud = opts.actions.filter((a) => !a.startsWith(':'));
  const signature: Record<string, string> = {
    list: 'list(filter?, order_by?, limit?)',
    get: 'get(id)',
    create: 'create(fields)',
    update: 'update(id, fields)',
    delete: 'delete(id)',
  };
  lines.push(`Actions: ${crud.map((a) => signature[a] ?? a).join(' · ')}.`);

  if (opts.requiredFields.length > 0 && opts.write) {
    lines.push(`create requires: ${opts.requiredFields.join(', ')}.`);
  }
  if (opts.parentPlurals.length > 0) {
    lines.push(
      `Nested under ${opts.parentPlurals.join(' → ')} — every action needs the` +
        ' parent ids above, list included.',
    );
  }
  if (!opts.write) {
    lines.push('This authorization is read-only, so no write actions are offered.');
  }
  if (opts.verbs.size > 0) {
    lines.push('Custom methods:');
    for (const [action, { binding }] of opts.verbs) {
      const method = def.customMethods?.[binding.verb];
      if (method) lines.push(verbLine(action, method, binding));
    }
  }

  return lines.join('\n');
}

/**
 * This surface's initialize `instructions`. Short by design: unlike `generic`,
 * the tool names already name the resources, so the model needs the calling
 * convention, not a catalog.
 */
export function resourceInstructions(): string {
  return [
    "This server exposes a Homestead household's data as AEP resources. Every call runs" +
      " with the signed-in user's own permissions.",
    '',
    'Each tool is one resource, and the verb is its `action` parameter: call with' +
      ' `action: "list"` to see what a collection holds, `"get"`/`"create"`/`"update"`/' +
      '`"delete"` to work with one record. A resource\'s fields are in the tool\'s own' +
      ' `fields` schema, so no lookup is needed before writing.',
    '',
    'An action written `:like-this` is an app-specific custom method; the tool description' +
      ' says what each one needs. Nested resources take their ancestor ids as `<parent>_id`' +
      ' params, required for every action.',
    '',
    'A `list` can be narrowed and sorted server-side, which is cheaper than reading a whole' +
      ' collection: pass `filter`, `order_by`, and `limit` (default and max 100; the result' +
      ' says when more matched).',
    `- filter: ${FILTER_SYNTAX}`,
    `- order_by: ${ORDER_BY_SYNTAX}`,
  ].join('\n');
}

// ────────────────────────────── argument checks ──────────────────────────────

/**
 * Collect the ancestor ids from top-level params. Checked before translation so
 * a missing one is named plainly rather than surfacing as a Zod type error.
 */
function collectParentIds(
  tool: ResourceTool,
  args: Record<string, unknown>,
): { ids: Record<string, string> } | { error: string } {
  const ids: Record<string, string> = {};
  for (const param of tool.parentParams) {
    const value = args[param];
    if (typeof value !== 'string' || !value) {
      return { error: `${tool.def.plural}: missing required parameter "${param}"` };
    }
    ids[param] = value;
  }
  return { ids };
}

/**
 * The requiredness one schema can't express: which actions need an `id`, which
 * need `fields`, and which fields a create must carry. Returns an error naming
 * what was accepted, or null when the call is well-formed.
 */
function checkCrudArgs(
  tool: ResourceTool,
  action: string,
  id: string | undefined,
  rawFields: unknown,
): string | null {
  const { plural } = tool.def;
  if ((action === 'get' || action === 'update' || action === 'delete') && !id) {
    return `${plural}: action "${action}" needs "id"`;
  }

  if (action !== 'create' && action !== 'update') return null;

  const fields = isRecord(rawFields) ? rawFields : {};
  if (Object.keys(fields).length === 0) {
    return action === 'create'
      ? `${plural}: action "create" needs "fields" — it accepts: ${tool.bodyFields.join(', ')}`
      : `${plural}: action "update" needs at least one field in "fields" (it is a merge` +
          ` patch) — it accepts: ${tool.bodyFields.join(', ')}`;
  }

  if (action === 'create') {
    const missing = tool.requiredFields.filter((field) => fields[field] === undefined);
    if (missing.length > 0) {
      return (
        `${plural}: create is missing required field${missing.length > 1 ? 's' : ''}` +
        ` ${missing.join(', ')} — it accepts: ${tool.bodyFields.join(', ')}`
      );
    }
  }
  return null;
}
