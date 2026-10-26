/**
 * Executes a model tool call against aepbase with the calling user's
 * token, so aepbase's own permissions apply. Never throws — every
 * failure (unknown tool, missing args, aepbase errors) becomes
 * `{ ok: false, error }` and is fed back to the model so it can
 * self-correct.
 */

import type { HomesteadClient, ListOptions } from '@rambleraptor/homestead-client';
import { collectionAt, serverClient } from '../client';
import type { ChatToolCall } from '../../chat/types';
import { referenceId } from '../../resources/references';
import { LIST_CAP, parentIdParam, type ToolBinding } from './tools';
import { householdMembers } from '../household';

/** The built-in accounts collection a `user` reference points into. */
const USERS = 'users';

/** Alternating `[plural, id, plural, id, ...]` segments naming a parent chain. */
type ParentPath = string[];

/** A provider-agnostic tool call: the tool name plus its parsed arguments. */
export interface ToolCall {
  name: string;
  args?: Record<string, unknown>;
}

/**
 * Where an attachment id in a file field comes from: the files of the chat
 * conversation the call runs in. Throws for an id that isn't one of them.
 */
export type AttachmentSource = (id: string) => Promise<File>;

export interface ExecuteOptions {
  attachments?: AttachmentSource;
}

/**
 * A record as the model sees it: secret fields dropped. The API already
 * returns only a descriptor for them, but even that (set or not, a hint) isn't
 * the model's business.
 */
function withoutSecrets<R>(binding: ToolBinding, record: R): R {
  const secrets = Object.entries(binding.def.fields)
    .filter(([, field]) => field.secret)
    .map(([name]) => name);
  if (secrets.length === 0 || record === null || typeof record !== 'object') return record;
  const out = { ...(record as Record<string, unknown>) };
  for (const name of secrets) delete out[name];
  return out as R;
}

function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * The list options a read-without-id carries: `filter` and `order_by` pass
 * straight to the engine (which rejects a bad one with a 400 the model can act
 * on), and `limit` becomes the page size, clamped to {@link LIST_CAP} however
 * it arrived — the Zod schema bounds it on the typed surface, but a derived
 * surface may hand the executor an untyped value.
 */
function listOptions(args: Record<string, unknown>): ListOptions {
  const limit = args.limit;
  const pageSize =
    typeof limit === 'number' && Number.isFinite(limit)
      ? Math.min(LIST_CAP, Math.max(1, Math.floor(limit)))
      : LIST_CAP;
  return { filter: stringArg(args.filter), orderBy: stringArg(args.order_by), pageSize };
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
      // Only a superuser may read another account, so a member's own token
      // can't confirm one; the household directory can.
      if (ref.plural === USERS && householdMembers().some((m) => m.id === referenceId(id, USERS))) continue;
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
 * with free-form-object fields JSON-parsed back into objects and file fields'
 * attachment ids swapped for the files themselves.
 */
async function buildBody(
  binding: ToolBinding,
  args: Record<string, unknown>,
  attachments: AttachmentSource | undefined,
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};
  for (const field of binding.bodyFields) {
    if (!(field in args) || args[field] === undefined) continue;
    if (binding.fileFields.has(field)) {
      const id = stringArg(args[field]);
      if (!id) throw new Error(`parameter "${field}" must be an attachment id`);
      if (!attachments) throw new Error(`parameter "${field}" takes a file, and there are none here`);
      body[field] = await attachments(id);
    } else if (binding.jsonStringFields.has(field) && typeof args[field] === 'string') {
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
  { attachments }: ExecuteOptions = {},
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
        const body = await buildBody(binding, args, attachments);
        const refErr = await validateReferences(binding, body, hs);
        if (refErr) return { ...base, ok: false, error: refErr };
        const result = withoutSecrets(binding, await records.create(body));
        return { ...base, ok: true, result };
      }
      case 'read': {
        const id = stringArg(args.id);
        if (id) {
          return { ...base, ok: true, result: withoutSecrets(binding, await records.get(id)) };
        }
        // One page, sized by `limit`: the engine does the filtering and
        // sorting, so a narrow question costs one small read instead of the
        // whole collection. A next-page token means more matched than fit.
        const opts = listOptions(args);
        const page = await records.page(opts);
        const truncated = page.nextPageToken !== undefined;
        const result = {
          records: page.records.map((record) => withoutSecrets(binding, record)),
          count: page.records.length,
          truncated,
          ...(truncated
            ? {
                note:
                  `More than ${opts.pageSize} records matched; only the first ${opts.pageSize}` +
                  ' are shown. Narrow with "filter" or sort with "order_by" so the ones you' +
                  ' need come first.',
              }
            : {}),
        };
        return { ...base, ok: true, result };
      }
      case 'update': {
        const id = stringArg(args.id);
        if (!id) throw new Error('missing required parameter "id"');
        const body = await buildBody(binding, args, attachments);
        const refErr = await validateReferences(binding, body, hs);
        if (refErr) return { ...base, ok: false, error: refErr };
        const result = withoutSecrets(binding, await records.record(id).update(body));
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
