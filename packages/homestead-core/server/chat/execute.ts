/**
 * Executes a model tool call against aepbase with the calling user's
 * token, so aepbase's own permissions apply. Never throws — every
 * failure (unknown tool, missing args, aepbase errors) becomes
 * `{ ok: false, error }` and is fed back to the model so it can
 * self-correct.
 */

import type { HomesteadClient } from '@rambleraptor/homestead-client';
import { collectionAt, serverClient } from '../client';
import type { ChatToolCall } from '../../chat/types';
import { referenceId } from '../../resources/references';
import { parentIdParam, type ToolBinding } from './tools';

/** Alternating `[plural, id, plural, id, ...]` segments naming a parent chain. */
type ParentPath = string[];

/** Cap on records returned to the model from a list call (context safety). */
const LIST_CAP = 100;

/** A provider-agnostic tool call: the tool name plus its parsed arguments. */
export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
}

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function buildParentPath(
  binding: ToolBinding,
  args: Record<string, unknown>,
): ParentPath | undefined {
  if (binding.parentChain.length === 0) return undefined;
  const path: ParentPath = [];
  for (const [i, parent] of binding.parentChain.entries()) {
    const id = stringArg(args[parentIdParam(parent)]);
    if (!id) {
      throw new Error(`missing required parameter "${parentIdParam(parent)}"`);
    }
    path.push(binding.parentPlurals[i], id);
  }
  return path;
}

/**
 * Verify every reference id in the body points at a real target record, under
 * the caller's own token (so an id the caller can't see counts as invalid).
 * Returns an error string for the first bad id, or null when all resolve.
 * Skips absent/empty values — an omitted optional reference isn't validated.
 */
async function validateReferences(
  binding: ToolBinding,
  body: Record<string, unknown>,
  hs: HomesteadClient,
): Promise<string | null> {
  for (const ref of binding.references) {
    const value = body[ref.field];
    if (value === undefined || value === null) continue;
    const ids = ref.isArray ? (Array.isArray(value) ? value : []) : [value];
    for (const id of ids) {
      if (typeof id !== 'string' || id.length === 0) continue;
      try {
        await hs.collection(ref.plural).get(referenceId(id, ref.plural));
      } catch {
        return `no ${ref.plural} record with id "${id}" (referenced by "${ref.field}")`;
      }
    }
  }
  return null;
}

/**
 * Extract the record body from tool args: only declared schema fields,
 * with free-form-object fields JSON-parsed back into objects.
 */
function buildBody(
  binding: ToolBinding,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of binding.bodyFields) {
    if (!(field in args) || args[field] === undefined) continue;
    if (binding.jsonStringFields.has(field) && typeof args[field] === 'string') {
      try {
        body[field] = JSON.parse(args[field] as string);
      } catch {
        throw new Error(`parameter "${field}" must be a valid JSON string`);
      }
    } else {
      body[field] = args[field];
    }
  }
  return body;
}

export async function executeToolCall(
  call: ToolCall,
  bindings: Map<string, ToolBinding>,
  token: string,
): Promise<ChatToolCall> {
  const args = (call.args ?? {}) as Record<string, unknown>;
  const base = { tool: call.name, args };

  const binding = bindings.get(call.name);
  if (!binding) {
    return { ...base, ok: false, error: `unknown tool "${call.name}"` };
  }

  try {
    const { plural } = binding.def;
    const hs = serverClient(token);
    const parent = buildParentPath(binding, args);
    const records = collectionAt(hs, plural, parent);

    switch (binding.op) {
      case 'create': {
        const body = buildBody(binding, args);
        const refErr = await validateReferences(binding, body, hs);
        if (refErr) return { ...base, ok: false, error: refErr };
        const result = await records.create(body);
        return { ...base, ok: true, result };
      }
      case 'read': {
        const id = stringArg(args.id);
        if (id) {
          return { ...base, ok: true, result: await records.get(id) };
        }
        const all = await records.listAll();
        const result =
          all.length > LIST_CAP
            ? {
                records: all.slice(0, LIST_CAP),
                total: all.length,
                truncated: true,
              }
            : { records: all, total: all.length };
        return { ...base, ok: true, result };
      }
      case 'update': {
        const id = stringArg(args.id);
        if (!id) throw new Error('missing required parameter "id"');
        const body = buildBody(binding, args);
        const refErr = await validateReferences(binding, body, hs);
        if (refErr) return { ...base, ok: false, error: refErr };
        const result = await records.record(id).update(body);
        return { ...base, ok: true, result };
      }
      case 'delete': {
        const id = stringArg(args.id);
        if (!id) throw new Error('missing required parameter "id"');
        await records.record(id).delete();
        return { ...base, ok: true, result: { deleted: true, id } };
      }
    }
  } catch (err) {
    return {
      ...base,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
