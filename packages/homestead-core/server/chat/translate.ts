/**
 * Translating a derived-surface call into the typed call it stands for.
 *
 * Both the `resource` and `generic` surfaces (see `./surface`) are re-shapings
 * of the same underlying operations, not reimplementations of them: a call is
 * flattened into exactly the arguments the corresponding typed tool takes,
 * validated against *that tool's own* Zod schema, and handed to
 * `executeToolCall` / `executeCustomMethod`. Keeping that step here means the
 * two surfaces cannot drift from each other or from `typed`, and that a
 * rejection is worded the same way wherever it comes from.
 *
 * The wording matters as much as the validation. A derived surface takes its
 * record body as one opaque object, so the model cannot read requiredness off
 * the schema the way it can on the typed surface — every rejection therefore
 * names what *was* accepted, so a wrong guess self-corrects in one round-trip
 * instead of dead-ending.
 */

import type { z } from 'zod';
import type { ToolBinding } from './tools';
import type { CustomMethodBinding } from './custom-methods';

/** A call ready for `executeToolCall` / `executeCustomMethod`. */
export interface TypedCall {
  name: string;
  args: Record<string, unknown>;
}

/** A translation that failed, with a message written for the model. */
export interface TranslationError {
  error: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Render Zod issues as one actionable sentence for the model. */
export function issueMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const at = issue.path.join('.');
      return at ? `${at}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

/**
 * Flatten a CRUD call into the args its typed tool takes, then validate them
 * against that tool's schema.
 *
 * `label` prefixes any error (the plural, so the model knows which resource
 * rejected it). `parentIds` carries the ancestor ids however the surface
 * collects them — `generic` takes them as one `parent_ids` record, `resource`
 * as top-level `<parent>_id` params — since by this point both are just a map
 * keyed the way the typed tool expects. `list` carries a list read's
 * `filter` / `order_by` / `limit` (see `pickListParams`), which the typed read
 * tool's schema validates like any other param.
 */
export function toTypedCall(
  label: string,
  name: string,
  binding: ToolBinding,
  schema: z.ZodObject,
  input: { id?: unknown; fields?: unknown; parentIds?: unknown; list?: unknown },
): TypedCall | TranslationError {
  const fields = isRecord(input.fields) ? input.fields : {};
  const unknown = Object.keys(fields).filter((key) => !binding.bodyFields.has(key));
  if (unknown.length > 0) {
    return {
      error:
        `unknown field${unknown.length > 1 ? 's' : ''} ${unknown.map((f) => `"${f}"`).join(', ')}` +
        ` on ${label} — it accepts: ${[...binding.bodyFields].join(', ')}`,
    };
  }

  const merged: Record<string, unknown> = {
    ...(isRecord(input.parentIds) ? input.parentIds : {}),
    ...fields,
    ...(isRecord(input.list) ? input.list : {}),
  };
  if (typeof input.id === 'string' && input.id) merged.id = input.id;

  const parsed = schema.safeParse(merged);
  if (!parsed.success) return { error: `${label}: ${issueMessage(parsed.error)}` };
  return { name, args: merged };
}

/**
 * Flatten a custom-method call the same way. A method that declares a `request`
 * schema takes its fields as params; one that doesn't takes the body whole
 * under `body` (see `./custom-methods`), so the two are merged differently.
 *
 * `schema` is the custom method tool's own input schema — validating against it
 * here is what lets a derived surface reject a malformed body with the method's
 * declared field names in the message, rather than passing it through for the
 * handler to reject opaquely.
 */
export function toCustomMethodCall(
  label: string,
  name: string,
  binding: CustomMethodBinding,
  schema: z.ZodObject,
  input: { id?: unknown; body?: unknown; parentIds?: unknown },
): TypedCall | TranslationError {
  const body = isRecord(input.body) ? input.body : {};
  const merged: Record<string, unknown> = {
    ...(isRecord(input.parentIds) ? input.parentIds : {}),
    ...(binding.freeFormBody ? { body } : body),
  };
  if (typeof input.id === 'string' && input.id) merged.id = input.id;

  // A free-form body is JSON-encoded as a string by the time the executor sees
  // it on the typed surface; here it arrives as an object, which the tool's
  // schema declares as a string. Skip validation in that case — the executor
  // accepts the object directly and there is no declared shape to check it
  // against anyway.
  if (!binding.freeFormBody) {
    const parsed = schema.safeParse(merged);
    if (!parsed.success) return { error: `${label}: ${issueMessage(parsed.error)}` };
  }
  return { name, args: merged };
}
