/**
 * Chat backend: `POST /api/chat`.
 *
 * `{ conversation_id?, message: { id, text } }` runs one stored, streamed turn
 * of a conversation (`./turns`) — as JSON, or as multipart with the message's
 * files attached (`./attachments`). This module holds what a turn is built from:
 * the system prompt and the tool set.
 *
 * The tools are the per-resource surface (`./per-resource`): one tool per
 * registered aepbase resource, the verb as an `action` parameter, with each
 * app's AEP-136 custom methods in the same enum — the surface `/api/mcp` serves
 * by default, so chat and an MCP client see the same tools. The configured
 * provider/model comes from homestead.config.ts. Tool calls execute against
 * aepbase with the caller's own token, so they can only do what the user could
 * do directly.
 */

import { authenticate, type AuthedUser } from '../aepbase';
import { getAllResourceDefs } from '../../apps/registry';
import { BUILTIN_RESOURCE_DEFS } from '../../resources/builtins';
import type { ResourceDefinition } from '../../resources/types';
import { visibleToModel } from '../../resources/model-tools';
import { isAiConfigured } from '../ai/config';
import { tool, type ToolSet } from '../ai/generate';
import { buildResourceTools, resourceInstructions } from './per-resource';
import { handleTurn } from './turns';
import { MAX_TURN_REQUEST_BYTES } from './attachments';
import { makeSearchTool, SEARCH_TOOL_NAME } from './search-tool';

export function buildSystemPrompt(user: AuthedUser, hasDocSearch: boolean): string {
  return [
    'You are the Homestead household assistant. You help members of the',
    'household look up and manage their data (todos, groceries, recipes,',
    'gift cards, events, and more) using the provided tools.',
    '',
    `Today's date: ${new Date().toISOString().slice(0, 10)}.`,
    `Signed-in user: id "${user.id}", email "${user.email}"` +
      (user.display_name ? `, name "${user.display_name}"` : '') +
      '.',
    '',
    'Tools:',
    resourceInstructions(),
    '',
    'Guidelines:',
    `- When a tool takes a "user_id" parameter (notifications, preferences,`,
    `  and other user-scoped data), use the signed-in user's id above. You`,
    '  can only act on data the signed-in user can access.',
    '- Todos come in two kinds: personal (private to one user; the',
    '  "personal_todos" tool, user-scoped via user_id) and family (shared with',
    '  the whole household; the "todos" tool). When a member asks to add or',
    '  list todos without saying which, default to PERSONAL for the signed-in',
    '  user. Use the family todos tool only when they say it is shared/family/',
    '  household.',
    '- Record ids are server-assigned. When you are not sure of an id, list',
    '  the collection (with a filter when you can) instead of guessing.',
    '- Prefer a filtered, sorted, limited list over reading a whole',
    '  collection: "due this week" is a filter on the due-date field, "the',
    '  latest five" is order_by with a limit.',
    ...(hasDocSearch
      ? [
          `- To answer questions about the contents of uploaded files, use the`,
          `  "${SEARCH_TOOL_NAME}" tool — it searches document text by meaning.`,
          '  Cite the resource type and record id of any passage you rely on.',
        ]
      : []),
    '- Updates are merge patches: send only the fields to change.',
    '- Deletes cannot be undone. Before deleting, confirm with the user',
    '  unless they have already clearly identified the exact record.',
    '- Answer in plain text, concisely. Summarize what you changed.',
  ].join('\n');
}

/**
 * The tool set one chat turn runs with: the per-resource surface over `defs`,
 * each tool executing under `token`, plus the semantic document search when
 * embeddings are configured. A failed call goes back to the model as
 * `{ error }` for it to correct, never thrown.
 */
export function buildChatToolSet(
  defs: ResourceDefinition[],
  token: string,
): { toolSet: ToolSet; hasDocSearch: boolean } {
  const surface = buildResourceTools(defs);
  const toolSet: ToolSet = {};
  for (const [name, spec] of Object.entries(surface.tools)) {
    toolSet[name] = tool({
      description: spec.description,
      inputSchema: spec.inputSchema,
      execute: async (rawArgs: unknown) => {
        const args = (rawArgs ?? {}) as Record<string, unknown>;
        const out = await surface.execute(name, args, token);
        return out.ok ? { result: out.result ?? null } : { error: out.error };
      },
    });
  }

  // Semantic search over embedded file fields. Auto-registered only when some
  // resource embeds a file field and embedding is configured; null otherwise.
  const searchTool = makeSearchTool({ defs, token });
  if (searchTool) toolSet[SEARCH_TOOL_NAME] = searchTool;

  return { toolSet, hasDocSearch: searchTool !== null };
}

export async function handleChat(request: Request): Promise<Response> {
  if (!isAiConfigured()) {
    return Response.json(
      {
        error: 'Service unavailable',
        message: 'AI is not configured on the server',
      },
      { status: 503 },
    );
  }

  const auth = await authenticate(request);
  if (!auth) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await readTurnRequest(request);
  if (parsed instanceof Response) return parsed;

  // Same definition union the schema sync applies, so the model sees every
  // collection that exists in aepbase — less any a definition hides from chat.
  const defs = visibleToModel([...BUILTIN_RESOURCE_DEFS, ...getAllResourceDefs()], 'chat');
  return handleTurn(auth, parsed.body, defs, parsed.uploads);
}

function badRequest(status: number, message: string): Response {
  return Response.json({ error: { code: status, message } }, { status });
}

/**
 * A turn request: JSON, or — with files attached — multipart, carrying the
 * same JSON as a `request` part and each file as an `attachments` part.
 */
async function readTurnRequest(
  request: Request,
): Promise<{ body: unknown; uploads: File[] } | Response> {
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'multipart/form-data') {
    try {
      return { body: await request.json(), uploads: [] };
    } catch {
      return badRequest(400, 'request body must be JSON');
    }
  }

  // Refuse an oversized upload before reading it into memory.
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_TURN_REQUEST_BYTES) {
    return badRequest(413, `a message with its files may be at most ${MAX_TURN_REQUEST_BYTES} bytes`);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest(400, 'invalid multipart body');
  }
  const json = form.get('request');
  if (typeof json !== 'string') return badRequest(400, 'a multipart turn needs a "request" JSON part');
  let body: unknown;
  try {
    body = JSON.parse(json);
  } catch {
    return badRequest(400, 'the "request" part must be JSON');
  }
  const uploads: File[] = [];
  for (const [name, value] of form.entries()) {
    if (name === 'request') continue;
    if (name !== 'attachments' || typeof value === 'string') {
      return badRequest(400, `unexpected part "${name}": files go in "attachments" parts`);
    }
    uploads.push(value);
  }
  return { body, uploads };
}
