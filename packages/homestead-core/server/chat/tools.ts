/**
 * Tool generation for the chat app.
 *
 * Maps every registered aepbase resource definition to four tools —
 * create/read/update/delete — so the model can operate on the user's data.
 * Pure: no registry or network access; callers pass the definition list (the
 * same `BUILTIN_RESOURCE_DEFS` + `getAllResourceDefs()` union the schema sync
 * applies). Tool input schemas are expressed as Zod schemas, which the Vercel
 * AI SDK translates to whichever provider is configured — so this stays
 * provider-agnostic. The matching execution metadata is returned as `bindings`;
 * `handler.ts` attaches the per-request `execute` closures.
 */

import { z } from 'zod';
import { referenceFields } from '../../resources/references';
import type { FieldDef, ResourceDefinition } from '../../resources/types';
import { logger } from '../../utils/logger';

export type CrudOp = 'create' | 'read' | 'update' | 'delete';

/**
 * A reference field the executor can validate before writing: the field name,
 * the target's plural (for the existence check), and whether it's a to-many
 * link. Only targets addressable by id alone (top-level resources, incl. the
 * built-in `user`) are listed — a parent-scoped target can't be fetched
 * without its parent path.
 */
export interface ReferenceCheck {
  field: string;
  plural: string;
  isArray: boolean;
}

/** Everything the executor needs to turn a model tool call into an aepbase request. */
export interface ToolBinding {
  op: CrudOp;
  def: ResourceDefinition;
  /** Ancestor singulars, root first — e.g. `['gift-card']` for transaction. */
  parentChain: string[];
  /** Plural for each `parentChain` entry, same order. */
  parentPlurals: string[];
  /** Tool params that map to schema fields (excludes `id` and parent ids). */
  bodyFields: Set<string>;
  /**
   * Top-level file fields, offered as the id of a file attached in the chat
   * (only when the tools are built with `files`). The executor swaps each id
   * for the file's bytes before writing.
   */
  fileFields: Set<string>;
  /**
   * Schema fields declared as free-form objects, taken as a JSON-encoded
   * string and JSON-parsed by the executor before hitting aepbase. (Originally
   * a Gemini constraint — empty OBJECT schemas were rejected — now kept for
   * uniform behavior across providers and to keep the executor's parse path
   * valid.)
   */
  jsonStringFields: Set<string>;
  /**
   * Reference fields the executor should existence-check before a create/update
   * write, so a bad id comes back as a correctable error instead of a dangling
   * pointer. Empty for reads/deletes and resources with no validatable
   * references.
   */
  references: ReferenceCheck[];
}

/** A tool's model-facing surface: description + Zod input schema. */
export interface ToolSpec {
  description: string;
  inputSchema: z.ZodTypeAny;
}

export interface BuiltTools {
  tools: Record<string, ToolSpec>;
  bindings: Map<string, ToolBinding>;
}

/** aepbase's built-in root resource (EnableUsers); never declared in code. */
const USER_ROOT = 'user';

/** Cap on records a single list call returns to the model (context safety). */
export const LIST_CAP = 100;

/**
 * The engine's list-filter grammar (`engine/filter.ts`), stated once for the
 * model. Used verbatim as the typed `filter` param's description and in the
 * derived surfaces' instructions, so every surface teaches the same syntax.
 */
export const FILTER_SYNTAX =
  'Syntax: `<field> <op> <value>` with ops == != < <= > >=, combined with && and ||' +
  ' and parentheses; `has(<field>)` is true when the field is set; `<field> in ["a", "b"]`' +
  ' matches any listed value; `"x" in <array_field>` tests array membership.' +
  ' `<field>.contains("x")`, `.startsWith("x")` and `.endsWith("x")` match part of a text field,' +
  ' ignoring case, and `<array_field>.exists(v, v.contains("x"))` does the same for a list of' +
  ' strings. People rarely give a full name or exact title, so look things up by what they' +
  ' called them with `contains` (e.g. `name.contains("Jake")`), not `==`. String values' +
  ' are double-quoted; date-times are ISO 8601 strings and compare as text, so' +
  ' `due_date < "2026-11-01"` works. Fields are the resource\'s own field names plus `id`,' +
  ' `create_time`, and `update_time` (UTC, e.g. `update_time > "2026-10-17T00:00:00Z"` for' +
  ' "changed this week").';

/** The `order_by` grammar (`engine/order.ts`), stated once for the model. */
export const ORDER_BY_SYNTAX =
  'Comma-separated field names, `-field` for descending, e.g. `-create_time` or' +
  ' `due_date, title`. `create_time` and `update_time` are orderable.';

/** Param names a list (a read without `id`) accepts, on every surface. */
export const LIST_PARAMS = ['filter', 'order_by', 'limit'] as const;
export type ListParam = (typeof LIST_PARAMS)[number];

/**
 * Zod shape for the list params. `brief` descriptions point at the surface's
 * instructions instead of restating the grammar — the per-resource surface
 * emits this shape once per resource, so the grammar is stated once in its
 * instructions rather than ~40 times.
 */
export function listParamShape({ brief = false } = {}): Record<ListParam, z.ZodTypeAny> {
  return {
    filter: z
      .string()
      .describe(
        'Only list records matching this expression.' +
          (brief ? ' Syntax is in the instructions.' : ` ${FILTER_SYNTAX}`),
      )
      .optional(),
    order_by: z
      .string()
      .describe(
        'Sort order.' + (brief ? ' Syntax is in the instructions.' : ` ${ORDER_BY_SYNTAX}`),
      )
      .optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(LIST_CAP)
      .describe(
        `Max records to return (1–${LIST_CAP}, default ${LIST_CAP}). The result says when` +
          ' more matched, so narrow the filter or sort so the ones you need come first.',
      )
      .optional(),
  };
}

/** The list params present in `args`, for a derived surface to pass through. */
export function pickListParams(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of LIST_PARAMS) if (args[key] !== undefined) out[key] = args[key];
  return out;
}
const USER_ROOT_PLURAL = 'users';

/** Tool names are snake_case, so kebab-case resource names lose their hyphens. */
export const snake = (s: string): string => s.replace(/-/g, '_');

/** Apply a description to a Zod schema only when one is present. */
function described<T extends z.ZodTypeAny>(schema: T, description?: string): T {
  return (description ? schema.describe(description) : schema) as T;
}

interface ConvertedProperty {
  schema: z.ZodTypeAny;
  /** True when a free-form object was downgraded to a JSON string. */
  jsonString: boolean;
}

/**
 * For a reference target that has tools on this surface, how to find one of
 * its records — e.g. `use read_person to find one`. Returns undefined for a
 * target with no tools (the built-in `user`, or a resource the surface hides),
 * where the hint stops at the resource name.
 */
type FindHint = (singular: string) => string | undefined;

/** The typed surface's hint: its read tool is `read_<singular>`. */
export const typedFindHint = (target: ResourceDefinition): string =>
  `use read_${snake(target.singular)} to find one`;

/**
 * Guidance appended to a reference field's description so the model knows the
 * id belongs to another resource — and, when that resource has tools on this
 * surface, how to find one.
 */
function referenceNote(
  reference: NonNullable<FieldDef['reference']>,
  findHint: FindHint,
): string {
  const base = `id of a ${reference.resource} record`;
  const hint = findHint(reference.resource);
  return hint ? `${base} (${hint})` : base;
}

/** Whether a file sits anywhere at or below this field. */
function holdsFile(field: FieldDef): boolean {
  if (field.type === 'file') return true;
  if (field.items && holdsFile(field.items)) return true;
  return Object.values(field.properties ?? {}).some(holdsFile);
}

/**
 * Convert one declared field to a Zod schema.
 * Returns null for fields the model can't supply: files, and any list that
 * holds files — a list is replaced whole on update, so a model that can't
 * name the files to keep would delete them.
 */
function fieldToZod(
  prop: FieldDef,
  findHint: FindHint,
): ConvertedProperty | null {
  if (prop.type === 'file') return null;

  const description = prop.description;
  switch (prop.type) {
    case 'string': {
      if (prop.enum?.length) {
        return {
          schema: described(z.enum(prop.enum as [string, ...string[]]), description),
          jsonString: false,
        };
      }
      let note = description;
      if (prop.reference) {
        const ref = referenceNote(prop.reference, findHint);
        note = note ? `${note} — ${ref}` : ref;
      } else if (prop.format === 'date-time') {
        note = `${description ? `${description} ` : ''}(ISO 8601 date-time)`;
      }
      return { schema: described(z.string(), note), jsonString: false };
    }
    case 'number':
      return { schema: described(z.number(), description), jsonString: false };
    case 'integer':
      return { schema: described(z.number().int(), description), jsonString: false };
    case 'boolean':
      return { schema: described(z.boolean(), description), jsonString: false };
    case 'array': {
      if (prop.items && holdsFile(prop.items)) return null;
      const items = prop.items ? fieldToZod(prop.items, findHint) : null;
      if (!items) return null;
      return { schema: described(z.array(items.schema), description), jsonString: false };
    }
    case 'object': {
      const entries = Object.entries(prop.properties ?? {});
      if (entries.length === 0) {
        // Free-form object: take a JSON-encoded string and parse it server-side.
        return {
          schema: described(
            z.string(),
            `${description ? `${description} ` : ''}(a JSON object, encoded as a JSON string)`,
          ),
          jsonString: true,
        };
      }
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, value] of entries) {
        const converted = fieldToZod(value, findHint);
        if (!converted) continue;
        shape[key] = value.required ? converted.schema : converted.schema.optional();
      }
      return { schema: described(z.object(shape), description), jsonString: false };
    }
    default:
      return null;
  }
}

/** Index definitions by singular — the lookup the chain helpers take. */
export function indexBySingular(
  defs: ResourceDefinition[],
): Map<string, ResourceDefinition> {
  return new Map(defs.map((d) => [d.singular, d]));
}

/**
 * Plural for a singular, falling back to naive pluralization for a target that
 * isn't declared (the built-in `user` root is special-cased).
 */
export function pluralOf(
  singular: string,
  bySingular: Map<string, ResourceDefinition>,
): string {
  return singular === USER_ROOT
    ? USER_ROOT_PLURAL
    : (bySingular.get(singular)?.plural ?? `${singular}s`);
}

/**
 * Resolve a definition's ancestor chain (root first) by following
 * `parents[0]` until the built-in `user` root or an undeclared parent.
 */
export function resolveParentChain(
  def: ResourceDefinition,
  bySingular: Map<string, ResourceDefinition>,
): string[] {
  if ((def.parents?.length ?? 0) > 1) {
    logger.warn(
      `chat tools: resource "${def.singular}" declares multiple parents; using the first`,
      { singular: def.singular },
    );
  }
  const chain: string[] = [];
  let current = def.parents?.[0];
  while (current) {
    chain.unshift(current);
    if (current === USER_ROOT) break;
    current = bySingular.get(current)?.parents?.[0];
  }
  return chain;
}

/**
 * Build the chat tools + execution bindings for a set of resource
 * definitions: one create/read/update/delete tool each.
 *
 * `findHint` words a reference field's "how to find one" for the surface that
 * will actually serve these schemas — `read_person` on the typed surface, the
 * `people` tool on the per-resource one. Only targets in `defs` get a hint.
 */
/** How a file field reads to the model when the tools can take attachments. */
export const ATTACHMENT_PARAM_NOTE =
  'the attachment id of a file the person attached in this conversation (shown beside it ' +
  'as `attachment id: …`)';

export interface BuildToolsOptions {
  findHint?: (target: ResourceDefinition) => string;
  /**
   * Offer top-level file fields as attachment ids. Only a surface that can
   * resolve them — the chat, over its conversation's attachments — sets this;
   * elsewhere file fields stay out of the tools, as before.
   */
  files?: boolean;
}

export function buildTools(
  defs: ResourceDefinition[],
  { findHint = typedFindHint, files = false }: BuildToolsOptions = {},
): BuiltTools {
  const bySingular = indexBySingular(defs);
  const hintFor: FindHint = (singular) => {
    const target = bySingular.get(singular);
    return target ? findHint(target) : undefined;
  };

  const tools: Record<string, ToolSpec> = {};
  const bindings = new Map<string, ToolBinding>();

  for (const def of defs) {
    const parentChain = resolveParentChain(def, bySingular);
    const parentPlurals = parentChain.map((s) => pluralOf(s, bySingular));

    // Required id param per ancestor, e.g. gift_card_id for transactions.
    const parentShape: Record<string, z.ZodTypeAny> = {};
    for (const [i, parent] of parentChain.entries()) {
      parentShape[`${snake(parent)}_id`] = z
        .string()
        .describe(`id of the parent ${parentPlurals[i]} record`);
    }

    // Field params, with their required-ness, shared by create/update.
    const fieldSchemas: Record<string, z.ZodTypeAny> = {};
    const bodyFields = new Set<string>();
    const jsonStringFields = new Set<string>();
    const fileFields = new Set<string>();
    for (const [key, prop] of Object.entries(def.fields)) {
      // Deprecated fields are on their way out — don't offer them to the model.
      // Secrets are never the model's to write (nor to read: see execute.ts).
      if (prop.deprecated || prop.secret) continue;
      if (prop.type === 'file') {
        if (!files) continue;
        const about = prop.description ? `${prop.description} — ` : '';
        fieldSchemas[key] = z.string().describe(`${about}${ATTACHMENT_PARAM_NOTE}`);
        bodyFields.add(key);
        fileFields.add(key);
        continue;
      }
      const converted = fieldToZod(prop, hintFor);
      if (!converted) continue;
      fieldSchemas[key] = converted.schema;
      bodyFields.add(key);
      if (converted.jsonString) jsonStringFields.add(key);
    }
    const requiredFields = new Set(
      Object.entries(def.fields)
        .filter(([key, prop]) => prop.required && bodyFields.has(key))
        .map(([key]) => key),
    );

    // Reference fields whose target is fetchable by id alone (top-level, incl.
    // the built-in `user`) — the executor existence-checks these on write.
    const references: ReferenceCheck[] = [];
    for (const fr of referenceFields(def)) {
      if (!bodyFields.has(fr.field)) continue;
      const target = fr.resource === USER_ROOT ? undefined : bySingular.get(fr.resource);
      const plural = fr.resource === USER_ROOT ? USER_ROOT_PLURAL : target?.plural;
      const parented = fr.resource === USER_ROOT ? false : (target?.parents?.length ?? 0) > 0;
      if (!plural || parented) continue;
      references.push({ field: fr.field, plural, isArray: fr.isArray });
    }

    // Create requires its required fields; update is a merge patch (all
    // optional). Read carries an optional id (omit to list).
    const createFields: Record<string, z.ZodTypeAny> = {};
    const updateFields: Record<string, z.ZodTypeAny> = {};
    for (const [key, schema] of Object.entries(fieldSchemas)) {
      createFields[key] = requiredFields.has(key) ? schema : schema.optional();
      updateFields[key] = schema.optional();
    }

    const nesting =
      parentChain.length > 0 ? ` Nested under: ${parentPlurals.join(' → ')}.` : '';
    const about = def.description ? ` ${def.description}` : '';
    const idParam = z.string().describe(`id of the ${def.singular} record`);

    const ops: Array<{ op: CrudOp; spec: ToolSpec }> = [
      {
        op: 'create',
        spec: {
          description: `Create a ${def.singular}.${about}${nesting}`,
          inputSchema: z.object({ ...parentShape, ...createFields }),
        },
      },
      {
        op: 'read',
        spec: {
          description:
            `Read ${def.plural}.${about}${nesting}` +
            ' Pass an id for one record; omit it to list, optionally narrowed with' +
            ' filter, sorted with order_by, and capped with limit.',
          inputSchema: z.object({
            ...parentShape,
            id: z
              .string()
              .describe(`id of the ${def.singular} record. Omit to list records.`)
              .optional(),
            ...listParamShape(),
          }),
        },
      },
      {
        op: 'update',
        spec: {
          description:
            `Update a ${def.singular}. Only the provided fields change (merge patch).` +
            `${about}${nesting}`,
          inputSchema: z.object({ ...parentShape, id: idParam, ...updateFields }),
        },
      },
      {
        op: 'delete',
        spec: {
          description: `Delete a ${def.singular}. This cannot be undone.${nesting}`,
          inputSchema: z.object({ ...parentShape, id: idParam }),
        },
      },
    ];

    for (const { op, spec } of ops) {
      const name = `${op}_${snake(def.singular)}`;
      tools[name] = spec;
      bindings.set(name, {
        op,
        def,
        parentChain,
        parentPlurals,
        bodyFields,
        jsonStringFields,
        fileFields,
        // Only create/update write bodies, so only they validate references.
        references: op === 'create' || op === 'update' ? references : [],
      });
    }
  }

  return { tools, bindings };
}

/** Exported for the executor; mirrors the tool-param naming above. */
export function parentIdParam(parentSingular: string): string {
  return `${snake(parentSingular)}_id`;
}
