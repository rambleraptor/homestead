/**
 * Chat backend: `POST /api/chat`.
 *
 * Runs a chat turn through the unified AI API over the per-resource tool
 * surface (`./per-resource`): one tool per registered aepbase resource, the
 * verb as an `action` parameter, with each app's AEP-136 custom methods in the
 * same enum — the surface `/api/mcp` serves by default, so chat and an MCP
 * client see the same tools. The configured provider/model comes from
 * homestead.config.ts. Tool calls execute against aepbase with the caller's
 * own token, so they can only do what the user could do directly.
 * Conversations are ephemeral — the client sends the full transcript each turn
 * and nothing is persisted server-side.
 */

import { authenticate, type AuthedUser } from '../aepbase';
import { getAllResourceDefs } from '../../apps/registry';
import { BUILTIN_RESOURCE_DEFS } from '../../resources/builtins';
import type { ResourceDefinition } from '../../resources/types';
import { logger } from '../../utils/logger';
import type {
  ChatMessage,
  ChatResponse,
  ChatToolCall,
} from '../../chat/types';
import { isAiConfigured } from '../ai/config';
import { aiRunAgent, tool, type ModelMessage, type ToolSet } from '../ai/generate';
import { buildResourceTools, resourceInstructions } from './per-resource';
import { makeSearchTool, SEARCH_TOOL_NAME } from './search-tool';

/** Max rounds of tool execution per turn before forcing a text answer. */
const MAX_TOOL_ROUNDS = 10;

function buildSystemPrompt(user: AuthedUser, hasDocSearch: boolean): string {
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

function badRequest(message: string): Response {
  return Response.json({ error: 'Bad request', message }, { status: 400 });
}

function isValidMessage(m: unknown): m is ChatMessage {
  if (typeof m !== 'object' || m === null) return false;
  const { role, content } = m as Record<string, unknown>;
  return (role === 'user' || role === 'assistant') && typeof content === 'string';
}

/**
 * The tool set one chat turn runs with: the per-resource surface over `defs`,
 * each tool executing under `token`, plus the semantic document search when
 * embeddings are configured. Every outcome is reported through `record` in
 * invocation order — the SDK calls each tool's `execute` and loops, so
 * recording here (vs. reading the final step) keeps the turn's `toolCalls`
 * ordered and complete even across several calls per step.
 *
 * Exported for tests; `handleChat` is the only runtime caller.
 */
export function buildChatToolSet(
  defs: ResourceDefinition[],
  token: string,
  record: (call: ChatToolCall) => void,
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
        record(
          out.ok
            ? { tool: name, args, ok: true, result: out.result }
            : { tool: name, args, ok: false, error: out.error },
        );
        return out.ok ? { result: out.result ?? null } : { error: out.error };
      },
    });
  }

  // Semantic search over embedded file fields. Auto-registered only when some
  // resource embeds a file field and embedding is configured; null otherwise.
  const searchTool = makeSearchTool({ defs, token, record });
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

  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return badRequest('request body must be JSON');
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return badRequest('messages must be a non-empty array');
  }
  if (!messages.every(isValidMessage)) {
    return badRequest('each message needs a user/assistant role and string content');
  }
  if (messages[messages.length - 1].role !== 'user') {
    return badRequest('the last message must be from the user');
  }

  // Same definition union the schema sync applies, so the model sees
  // every collection that exists in aepbase.
  const defs = [...BUILTIN_RESOURCE_DEFS, ...getAllResourceDefs()];
  const toolCalls: ChatToolCall[] = [];
  const { toolSet, hasDocSearch } = buildChatToolSet(defs, auth.token, (call) =>
    toolCalls.push(call),
  );

  const modelMessages: ModelMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const { text } = await aiRunAgent({
      system: buildSystemPrompt(auth.user, hasDocSearch),
      messages: modelMessages,
      tools: toolSet,
      maxRounds: MAX_TOOL_ROUNDS,
    });

    const response: ChatResponse = { reply: text, toolCalls };
    return Response.json(response);
  } catch (err) {
    logger.error('chat: AI request failed', err);
    return Response.json(
      {
        error: 'Bad gateway',
        message: err instanceof Error ? err.message : 'The AI request failed',
      },
      { status: 502 },
    );
  }
}
