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
import type { AttachmentSource } from './execute';
import type { WriteAccess } from './surface';
import { handleTurn } from './turns';
import { MAX_TURN_REQUEST_BYTES } from './attachments';
import { makeSearchTool, SEARCH_TOOL_NAME } from './search-tool';
import { VALUE_SCHEME } from '../../chat/values';

/** What a turn's system prompt is built from, besides the person. */
export interface PromptContext {
  /** The person's local date and time (`localNow` in `./context`). */
  now: string;
  /** Whether the semantic document search is among the tools. */
  hasDocSearch: boolean;
  /** Notes from the apps whose tools are offered (`appNotes` in `./context`). */
  appNotes?: string[];
  /** The typed values replies can mark, one line each (`valueTypeLines`). */
  valueTypes?: string[];
}

export function buildSystemPrompt(user: AuthedUser, context: PromptContext): string {
  const { now, hasDocSearch, appNotes = [], valueTypes = [] } = context;
  return [
    'You are the Homestead household assistant. You help members of the',
    'household look up and manage their data (todos, groceries, recipes,',
    'gift cards, events, and more) using the provided tools.',
    '',
    `Now: ${now}. Read "today", "tomorrow" and times of day in this timezone.`,
    `Signed-in user: id "${user.id}", email "${user.email}"` +
      (user.display_name ? `, name "${user.display_name}"` : '') +
      '.',
    '',
    'Tools:',
    resourceInstructions(),
    '',
    ...(appNotes.length > 0 ? ['App notes:', ...appNotes, ''] : []),
    'Guidelines:',
    `- When a tool takes a "user_id" parameter (notifications, preferences,`,
    `  and other user-scoped data), use the signed-in user's id above. You`,
    '  can only act on data the signed-in user can access.',
    '- Record ids are server-assigned. When you are not sure of an id, list',
    '  the collection (with a filter when you can) instead of guessing.',
    '- Prefer a filtered, sorted, limited list over reading a whole',
    '  collection: "due this week" is a filter on the due-date field, "the',
    '  latest five" is order_by with a limit.',
    '- When a question matches more than one record (two people named Jake,',
    '  two gift cards from the same store), answer for every match, each',
    '  labelled so they can be told apart, rather than asking which one was',
    '  meant. Ask only before creating, changing or deleting something when',
    '  it is unclear which record the change is for.',
    ...(hasDocSearch
      ? [
          `- To answer questions about the contents of uploaded files, use the`,
          `  "${SEARCH_TOOL_NAME}" tool — it searches document text by meaning.`,
          '  Cite the resource type and record id of any passage you rely on.',
        ]
      : []),
    '- A file the person attached is labelled with its attachment id. To',
    '  save it into a record, pass that id as the value of a file field;',
    '  set any field describing the file (such as a mime_type) from its',
    '  media type. Only attachments from this conversation can be used.',
    '- Updates are merge patches: send only the fields to change.',
    '- Deletes cannot be undone. Before deleting, confirm with the user',
    '  unless they have already clearly identified the exact record.',
    '- Replies are rendered as Markdown, so format them to be scanned:',
    '  - Several records or steps: a bulleted (or numbered) list, one per',
    "    line, with the record's name in **bold** and its details after it.",
    '  - Records compared on the same few fields: a table.',
    '  - Bold the values that were asked for: dates, amounts, addresses.',
    '  - A single fact: one short sentence, not a list.',
    '  - Headings only to separate the parts of a long answer.',
    '- Be concise. After a change, say what changed (a list when several did).',
    ...(valueTypes.length > 0
      ? [
          '- Typed values: write each value of these kinds as a Markdown link to',
          `  ${VALUE_SCHEME}:<type>, with the value itself as the link text, and the`,
          '  chat makes it do the right thing (open a map, dial). Use them for values',
          '  read from records, in lists and tables too; never put a URL in one.',
          ...valueTypes.map((line) => `  ${line}`),
        ]
      : []),
  ].join('\n');
}

/**
 * The tool set one chat turn runs with: the per-resource surface over `defs`,
 * each tool executing under `token`, plus the semantic document search when
 * embeddings are configured. A failed call goes back to the model as
 * `{ error }` for it to correct, never thrown. `attachments` resolves the
 * conversation's attached files, which file fields then accept by id; `write`
 * says which resources are offered write actions.
 */
export function buildChatToolSet(
  defs: ResourceDefinition[],
  token: string,
  { attachments, write = true }: { attachments?: AttachmentSource; write?: WriteAccess } = {},
): { toolSet: ToolSet; hasDocSearch: boolean } {
  const surface = buildResourceTools(defs, { attachments, write });
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
