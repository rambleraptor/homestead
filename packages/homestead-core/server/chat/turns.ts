/**
 * The chat turn runner: one stored, streamed turn of a conversation.
 *
 * `POST /api/chat` with `{ conversation_id?, message: { id, text } }` lands
 * here (see `./handler`). The server owns the history — the client sends only
 * its new message — so a turn:
 *
 *  1. resolves the conversation (creating it when no id is given) under the
 *     caller's own token, so its access rules apply;
 *  2. refuses to start while another turn in the same conversation runs (409);
 *  3. writes the user's message, and an assistant message in `streaming`
 *     state, at the next `seq`;
 *  4. rebuilds the model's context from the stored messages
 *     (`convertToModelMessages` over their UI parts), so the model remembers
 *     what its tools read in earlier turns;
 *  5. streams the model, writing the assistant message's parts at every step
 *     boundary — never per token — and its final status, usage, or error at
 *     the end;
 *  6. answers with the AI SDK's UI message stream.
 *
 * The turn runs to completion whether or not anyone is listening
 * (`consumeStream`), so closing the tab doesn't lose it: the writes reach every
 * device through the change feed. A turn is cancelled through the
 * conversation's `:cancel` custom method, which aborts it via the in-process
 * registry below — the server is one process, so a map is the whole registry.
 */

import { convertToModelMessages, type UIMessage } from 'ai';
import type { CollectionRef } from '@rambleraptor/homestead-client';
import { HomesteadError } from '@rambleraptor/homestead-client';
import type { AuthResult } from '../aepbase';
import { serverClient } from '../client';
import { aiStreamAgent } from '../ai/generate';
import { logger } from '../../utils/logger';
import { CHAT_MESSAGES, CONVERSATIONS } from '../../chat/resources';
import type { ChatTurnRequest } from '../../chat/types';
import type { ResourceDefinition } from '../../resources/types';
import { buildChatToolSet, buildSystemPrompt } from './handler';

/** Max rounds of tool execution per turn before forcing a text answer. */
const MAX_TOOL_ROUNDS = 10;

/** How many stored messages the model sees, newest last. */
export const HISTORY_LIMIT = 40;

/** A tool output stored larger than this (as JSON) is replaced by a preview. */
export const STORED_OUTPUT_CAP = 4000;

/** Characters of a capped output kept as its preview. */
const PREVIEW_CHARS = 1000;

/** The longest title derived from a first message. */
const TITLE_CHARS = 60;

/** The longest message a person can send in one turn. */
export const MAX_MESSAGE_CHARS = 20_000;

interface ConversationRecord {
  id: string;
  title?: string;
  status?: string;
}

interface StoredMessage {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  content?: string;
  parts?: UIMessage['parts'];
  status?: string;
}

// ─────────────────────────────── the registry ───────────────────────────────

/** Conversation id → the running turn's abort controller. */
const running = new Map<string, AbortController>();

/** Abort the turn running in `conversationId`. False when none is running. */
export function cancelTurn(conversationId: string): boolean {
  const controller = running.get(conversationId);
  if (!controller) return false;
  controller.abort();
  return true;
}

/** Whether a turn is running in `conversationId`. */
export function isTurnRunning(conversationId: string): boolean {
  return running.has(conversationId);
}

// ─────────────────────────────── stored parts ───────────────────────────────

/** A tool output small enough to store, or a preview standing in for it. */
export function capOutput(output: unknown): unknown {
  let json: string;
  try {
    json = JSON.stringify(output);
  } catch {
    return { unserializable: true };
  }
  if (json === undefined || json.length <= STORED_OUTPUT_CAP) return output;
  return { truncated: true, size: json.length, preview: json.slice(0, PREVIEW_CHARS) };
}

/** One piece of a finished step's content, as `streamText` reports it. */
type StepContent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; input: unknown; output: unknown }
  | { type: 'tool-error'; toolCallId: string; toolName: string; input: unknown; error: unknown }
  | { type: string };

/**
 * A finished step as UI message parts — the same parts the UI message stream
 * builds on the client, so stored history and a live turn render alike — with
 * each tool call merged with its result (or error) and its output capped.
 */
export function partsFromStep(content: readonly StepContent[]): UIMessage['parts'] {
  const parts: Record<string, unknown>[] = [{ type: 'step-start' }];
  const toolParts = new Map<string, Record<string, unknown>>();
  for (const item of content) {
    switch (item.type) {
      case 'text':
      case 'reasoning': {
        const { text } = item as { text: string };
        if (text) parts.push({ type: item.type, text, state: 'done' });
        break;
      }
      case 'tool-call': {
        const call = item as { toolCallId: string; toolName: string; input: unknown };
        const part = {
          type: `tool-${call.toolName}`,
          toolCallId: call.toolCallId,
          state: 'input-available',
          input: call.input,
        };
        toolParts.set(call.toolCallId, part);
        parts.push(part);
        break;
      }
      case 'tool-result':
      case 'tool-error': {
        const done = item as {
          toolCallId: string;
          toolName: string;
          input: unknown;
          output?: unknown;
          error?: unknown;
        };
        let part = toolParts.get(done.toolCallId);
        if (!part) {
          part = { type: `tool-${done.toolName}`, toolCallId: done.toolCallId, input: done.input };
          toolParts.set(done.toolCallId, part);
          parts.push(part);
        }
        if (item.type === 'tool-result') {
          Object.assign(part, { state: 'output-available', output: capOutput(done.output) });
        } else {
          Object.assign(part, { state: 'output-error', errorText: String(done.error) });
        }
        break;
      }
    }
  }
  return parts as UIMessage['parts'];
}

/** The plain text of a message's parts. */
export function textOfParts(parts: UIMessage['parts']): string {
  return parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n\n');
}

/** Whether a part says anything: a step marker or an empty text doesn't. */
function isMeaningful(part: UIMessage['parts'][number]): boolean {
  if (part.type === 'step-start') return false;
  if (part.type === 'text') return part.text.trim() !== '';
  return true;
}

/**
 * Stored messages as UI messages, oldest first, for `convertToModelMessages`.
 * A message with no parts falls back to its plain content; one with nothing to
 * say at all — an assistant message that failed before its first step — is
 * left out rather than handed to the model as an empty turn.
 */
export function toUiMessages(stored: readonly StoredMessage[]): UIMessage[] {
  return stored
    .map((m): UIMessage => ({
      id: m.id,
      role: m.role,
      parts:
        m.parts && m.parts.length > 0
          ? m.parts
          : m.content
            ? [{ type: 'text', text: m.content }]
            : [],
    }))
    .filter((m) => m.parts.some(isMeaningful));
}

/** A title from the first message: its first line, trimmed to a short length. */
export function titleFrom(text: string): string {
  const line = text.trim().split('\n')[0] ?? '';
  return line.length > TITLE_CHARS ? `${line.slice(0, TITLE_CHARS - 1).trimEnd()}…` : line;
}

// ─────────────────────────────── the turn ───────────────────────────────

function problem(status: number, message: string): Response {
  return Response.json({ error: { code: status, message } }, { status });
}

/** Map a failed engine call to the same status for the client. */
function engineFailure(err: unknown): Response {
  if (err instanceof HomesteadError) return problem(err.code, err.message);
  throw err;
}

function isValidRequest(body: unknown): body is ChatTurnRequest {
  if (typeof body !== 'object' || body === null) return false;
  const { conversation_id, message } = body as Record<string, unknown>;
  if (conversation_id !== undefined && (typeof conversation_id !== 'string' || !conversation_id)) {
    return false;
  }
  if (typeof message !== 'object' || message === null) return false;
  const { id, text } = message as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof text === 'string' &&
    text.trim() !== '' &&
    text.length <= MAX_MESSAGE_CHARS
  );
}

const now = () => new Date().toISOString();

/**
 * Run one turn of a stored conversation and stream it back. `defs` is the
 * resource union the chat tools are built over (already filtered for chat).
 */
export async function handleTurn(
  auth: AuthResult,
  body: unknown,
  defs: ResourceDefinition[],
): Promise<Response> {
  if (!isValidRequest(body)) {
    return problem(
      400,
      'expected { conversation_id?, message: { id, text } } with a non-empty id, and text ' +
        `of 1–${MAX_MESSAGE_CHARS} characters`,
    );
  }
  const { message } = body;
  const hs = serverClient(auth.token);
  const conversations = hs.collection<ConversationRecord>(CONVERSATIONS);

  // 1. The conversation, under the caller's own access.
  let conversation: ConversationRecord;
  try {
    conversation = body.conversation_id
      ? await conversations.get(body.conversation_id)
      : await conversations.create({
          title: titleFrom(message.text),
          status: 'idle',
          last_message_at: now(),
          created_by: auth.user.id,
        });
  } catch (err) {
    return engineFailure(err);
  }
  const conversationId = conversation.id;

  // 2. One turn at a time. Checked and claimed with no await in between.
  if (running.has(conversationId)) {
    return problem(409, 'a turn is already running in this conversation');
  }
  const controller = new AbortController();
  running.set(conversationId, controller);

  const messages: CollectionRef<StoredMessage> = conversations
    .record(conversationId)
    .collection<StoredMessage>(CHAT_MESSAGES);
  const assistantId = `${message.id}-reply`;

  let finished = false;
  /** Release the conversation and record how the turn ended. Runs once. */
  const finish = async (patch: Partial<StoredMessage> & { error?: string; usage?: unknown }) => {
    if (finished) return;
    finished = true;
    running.delete(conversationId);
    try {
      await messages.record(assistantId).update(patch);
      await conversations.record(conversationId).update({ status: 'idle', last_message_at: now() });
    } catch (err) {
      logger.error('chat: could not record the end of a turn', err);
    }
  };

  // 3. History, then this turn's two messages at the next positions.
  let history: StoredMessage[];
  try {
    history = await messages.listAll({ orderBy: 'seq' });
    const seq = (history.at(-1)?.seq ?? 0) + 1;
    const userMessage: StoredMessage = {
      id: message.id,
      seq,
      role: 'user',
      content: message.text,
      parts: [{ type: 'text', text: message.text }],
      status: 'complete',
    };
    const { id: userId, ...userBody } = userMessage;
    // A retried send reuses its id, so it lands here as a 409 — not a duplicate.
    await messages.create(userBody, { id: userId });
    history.push(userMessage);
    await messages.create(
      { seq: seq + 1, role: 'assistant', content: '', parts: [], status: 'streaming' },
      { id: assistantId },
    );
    await conversations.record(conversationId).update({ status: 'running', last_message_at: now() });
  } catch (err) {
    running.delete(conversationId);
    return engineFailure(err);
  }

  // 4. The model's context, rebuilt from storage.
  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(toUiMessages(history.slice(-HISTORY_LIMIT)));
  } catch (err) {
    await finish({ status: 'error', error: `could not rebuild the conversation: ${String(err)}` });
    return problem(500, 'could not rebuild the conversation history');
  }

  // 5. Stream the model, writing the assistant message at each step boundary.
  const { toolSet, hasDocSearch } = buildChatToolSet(defs, auth.token);
  const parts: UIMessage['parts'] = [];
  // The reply text of the step in flight. Steps are stored when they end, so
  // without this a stopped turn would lose the words the reader already saw.
  let stepText = '';
  const partsSoFar = (): UIMessage['parts'] =>
    stepText ? [...parts, { type: 'text', text: stepText, state: 'done' }] : parts;
  let result: ReturnType<typeof aiStreamAgent>;
  try {
    result = aiStreamAgent({
      system: buildSystemPrompt(auth.user, hasDocSearch),
      messages: modelMessages,
      tools: toolSet,
      maxRounds: MAX_TOOL_ROUNDS,
      abortSignal: controller.signal,
      onChunk: ({ chunk }: { chunk: { type: string; text?: string } }) => {
        if (chunk.type === 'text-delta') stepText += chunk.text ?? '';
      },
      onStepEnd: async (step: { content: readonly StepContent[] }) => {
        stepText = '';
        parts.push(...partsFromStep(step.content));
        try {
          await messages.record(assistantId).update({ parts, content: textOfParts(parts) });
        } catch (err) {
          logger.error('chat: could not record a step', err);
        }
      },
      onFinish: async (event: { totalUsage?: unknown }) => {
        await finish({
          status: 'complete',
          parts,
          content: textOfParts(parts),
          usage: event.totalUsage,
        });
      },
      onError: async ({ error }: { error: unknown }) => {
        logger.error('chat: turn failed', error);
        await finish({
          status: 'error',
          parts,
          content: textOfParts(parts),
          error: error instanceof Error ? error.message : String(error),
        });
      },
      onAbort: async () => {
        const kept = partsSoFar();
        await finish({ status: 'cancelled', parts: kept, content: textOfParts(kept) });
      },
    } as Parameters<typeof aiStreamAgent>[0]);
  } catch (err) {
    // The model couldn't even start: release the conversation, say why.
    logger.error('chat: could not start a turn', err);
    await finish({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    return problem(502, 'the AI request could not be started');
  }

  // Run to the end whether or not the client stays to read it.
  void Promise.resolve(result.consumeStream()).catch(() => {});

  // 6. The UI message stream, carrying the conversation and message ids so a
  //    client that started a new conversation learns where it lives.
  //    The streamed message takes the stored assistant message's id, so the
  //    client's copy and the stored one are the same message.
  return result.toUIMessageStreamResponse({
    headers: { 'X-Conversation-Id': conversationId },
    generateMessageId: () => assistantId,
    messageMetadata: ({ part }: { part: { type: string } }) =>
      part.type === 'start' ? { conversationId, messageId: assistantId } : undefined,
  });
}
