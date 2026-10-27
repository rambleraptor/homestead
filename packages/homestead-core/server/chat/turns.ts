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
import type { CollectionRef, FileDescriptor } from '@rambleraptor/homestead-client';
import { HomesteadError } from '@rambleraptor/homestead-client';
import type { AuthResult } from '../aepbase';
import { serverClient } from '../client';
import { aiStreamAgent } from '../ai/generate';
import { logger } from '../../utils/logger';
import { CHAT_MESSAGES, CONVERSATIONS } from '../../chat/resources';
import type { ChatTurnRequest } from '../../chat/types';
import type { ResourceDefinition } from '../../resources/types';
import { buildChatToolSet, buildSystemPrompt } from './handler';
import { appContext, appNotes, householdLines, localNow, resolveTimezone } from './context';
import { householdFor } from '../household';
import { valueTypeLines } from '../../chat/values';
import { getAllApps } from '../../apps/registry';
import { modelResourcesFor } from '../collection-access';
import { attachmentSource, attachmentsTitle, checkAttachments, withAttachments } from './attachments';
import { buildMcpToolSet, mcpPromptLines, recordDeniedMcpCall } from './mcp-tools';

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
  attachments?: FileDescriptor[];
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
  | { type: 'tool-approval-request'; approvalId: string; toolCall: { toolCallId: string; toolName: string; input: unknown } }
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
      case 'tool-approval-request':
      case 'tool-approval-response': {
        const asked = item as {
          approvalId: string;
          approved?: boolean;
          reason?: string;
          toolCall: { toolCallId: string; toolName: string; input: unknown };
        };
        let part = toolParts.get(asked.toolCall.toolCallId);
        if (!part) {
          part = {
            type: `tool-${asked.toolCall.toolName}`,
            toolCallId: asked.toolCall.toolCallId,
            input: asked.toolCall.input,
          };
          toolParts.set(asked.toolCall.toolCallId, part);
          parts.push(part);
        }
        if (item.type === 'tool-approval-request') {
          Object.assign(part, { state: 'approval-requested', approval: { id: asked.approvalId } });
        } else if (asked.approved === false) {
          Object.assign(part, {
            state: 'output-denied',
            approval: { id: asked.approvalId, approved: false, ...(asked.reason ? { reason: asked.reason } : {}) },
          });
        }
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

/**
 * Add a finished step to a message's `parts`. A tool call the message already
 * holds — one resumed after the person approved it — is updated where it is,
 * so its result lands on the card that asked, not on a copy below it.
 */
export function mergeStep(parts: UIMessage['parts'], content: readonly StepContent[]): void {
  for (const part of partsFromStep(content)) {
    const id = (part as { toolCallId?: string }).toolCallId;
    const existing = id ? parts.find((p) => (p as { toolCallId?: string }).toolCallId === id) : undefined;
    if (existing) Object.assign(existing, part);
    else parts.push(part);
  }
}

/** The chunks `streamText` reports as they happen, as far as the runner reads them. */
type StreamChunk = {
  type: string;
  text?: string;
  toolCallId?: string;
  output?: unknown;
  error?: unknown;
};

/**
 * A tool outcome for a call already in `parts` — one resumed after its
 * approval — written onto that part. Anything else waits for its step.
 */
export function settleResumedCall(parts: UIMessage['parts'], chunk: StreamChunk): void {
  if (!chunk.toolCallId) return;
  const part = (parts as ToolPartShape[]).find((p) => p.toolCallId === chunk.toolCallId);
  if (!part || part.state !== 'approval-responded') return;
  if (chunk.type === 'tool-result') {
    Object.assign(part, { state: 'output-available', output: capOutput(chunk.output) });
  } else if (chunk.type === 'tool-error') {
    Object.assign(part, { state: 'output-error', errorText: String(chunk.error) });
  } else if (chunk.type === 'tool-output-denied') {
    part.state = 'output-denied';
  }
}

type ToolPartShape = {
  type: string;
  toolCallId?: string;
  input?: unknown;
  state?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
};

/** The tool part in `parts` waiting on approval `approvalId`, if any. */
export function pendingApproval(parts: UIMessage['parts'] | undefined, approvalId: string): ToolPartShape | undefined {
  return (parts ?? [])
    .map((p) => p as ToolPartShape)
    .find((p) => p.state === 'approval-requested' && p.approval?.id === approvalId);
}

/** Why an approval left waiting was denied. */
export const UNANSWERED_REASON = 'not answered before the next message';

/**
 * Settle every approval still waiting in `parts` as denied — the person moved
 * on without answering, so the call never runs. Returns the parts it denied.
 */
export function denyPendingApprovals(parts: UIMessage['parts'] | undefined): ToolPartShape[] {
  const denied: ToolPartShape[] = [];
  for (const p of (parts ?? []) as ToolPartShape[]) {
    if (p.state !== 'approval-requested' || !p.approval) continue;
    p.state = 'output-denied';
    p.approval = { id: p.approval.id, approved: false, reason: UNANSWERED_REASON };
    denied.push(p);
  }
  return denied;
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
 * Whether a stored part is one the turn runner writes: text, reasoning, step
 * markers, tool calls. Anyone who can write a conversation can write its
 * messages through the API, so stored parts are untrusted — and a `file` part
 * carrying a URL would have the AI SDK fetch it from the server. Files reach
 * the model only from stored attachments (`./attachments`).
 */
function isRunnerPart(part: UIMessage['parts'][number]): boolean {
  return (
    part.type === 'text' ||
    part.type === 'reasoning' ||
    part.type === 'step-start' ||
    part.type.startsWith('tool-')
  );
}

/**
 * Stored messages as UI messages, oldest first, for `convertToModelMessages`.
 * A message with no parts falls back to its plain content; one with nothing to
 * say at all — an assistant message that failed before its first step — is
 * left out rather than handed to the model as an empty turn. A message that is
 * only attachments stays: they're added by `withAttachments`.
 */
export function toUiMessages(stored: readonly StoredMessage[]): UIMessage[] {
  return stored
    .map((m): UIMessage => {
      const parts = (m.parts ?? []).filter(isRunnerPart);
      return {
        id: m.id,
        role: m.role,
        parts: parts.length > 0 ? parts : m.content ? [{ type: 'text', text: m.content }] : [],
      };
    })
    .filter((m, i) => m.parts.some(isMeaningful) || (stored[i]!.attachments?.length ?? 0) > 0);
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

/**
 * A well-formed request: a message (whose text may be empty only when files
 * come with it), or an answer to an approval in an existing conversation.
 */
function isValidRequest(body: unknown, hasAttachments: boolean): body is ChatTurnRequest {
  if (typeof body !== 'object' || body === null) return false;
  const { conversation_id, message, approval, timezone } = body as Record<string, unknown>;
  if (conversation_id !== undefined && (typeof conversation_id !== 'string' || !conversation_id)) {
    return false;
  }
  if (timezone !== undefined && typeof timezone !== 'string') return false;
  if (approval !== undefined) {
    if (message !== undefined || hasAttachments || !conversation_id) return false;
    if (typeof approval !== 'object' || approval === null) return false;
    const { id, approved } = approval as Record<string, unknown>;
    return typeof id === 'string' && id.length > 0 && typeof approved === 'boolean';
  }
  if (typeof message !== 'object' || message === null) return false;
  const { id, text } = message as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof text === 'string' &&
    (text.trim() !== '' || hasAttachments) &&
    text.length <= MAX_MESSAGE_CHARS
  );
}

const now = () => new Date().toISOString();

/**
 * Run one turn of a stored conversation and stream it back. `defs` is the
 * resource union the chat tools are built over (already filtered for chat);
 * `uploads` are the files attached to the message, if any.
 */
export async function handleTurn(
  auth: AuthResult,
  body: unknown,
  defs: ResourceDefinition[],
  uploads: File[] = [],
): Promise<Response> {
  if (!isValidRequest(body, uploads.length > 0)) {
    return problem(
      400,
      'expected { conversation_id?, message: { id, text }, timezone? } with a non-empty id, and text ' +
        `of 1–${MAX_MESSAGE_CHARS} characters (it may be empty when files are attached); or ` +
        '{ conversation_id, approval: { id, approved } } to answer an approval',
    );
  }
  // Checked before anything is created, so a bad file leaves nothing behind.
  const checked = await checkAttachments(uploads);
  if (!checked.ok) return problem(checked.status, checked.message);
  const attachments = checked.files;
  const { message, approval } = body;
  const hs = serverClient(auth.token);
  const conversations = hs.collection<ConversationRecord>(CONVERSATIONS);

  // 1. The conversation, under the caller's own access.
  let conversation: ConversationRecord;
  try {
    conversation = body.conversation_id
      ? await conversations.get(body.conversation_id)
      : await conversations.create({
          title: titleFrom(message!.text) || titleFrom(attachmentsTitle(attachments)),
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
  // A resumed turn continues the reply that asked; a new one gets its own.
  let assistantId = message ? `${message.id}-reply` : '';
  let resumed: UIMessage['parts'] | undefined;
  let answered: ToolPartShape | undefined;
  /** Approvals the person declined, or left unanswered, this turn. */
  const declined: ToolPartShape[] = [];

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

  // 3. History, then this turn's two messages at the next positions — or, for
  //    an answer to an approval, the reply that asked, taken up again.
  let history: StoredMessage[];
  try {
    history = await messages.listAll({ orderBy: 'seq' });
    const last = history.at(-1);
    if (approval) {
      const waiting = last?.role === 'assistant' ? pendingApproval(last.parts, approval.id) : undefined;
      if (!last || !waiting) {
        running.delete(conversationId);
        return problem(409, 'nothing in this conversation is waiting on that approval');
      }
      waiting.state = 'approval-responded';
      waiting.approval = { id: approval.id, approved: approval.approved };
      answered = waiting;
      assistantId = last.id;
      resumed = last.parts ?? [];
      await messages.record(last.id).update({ parts: resumed, status: 'streaming' });
      await conversations.record(conversationId).update({ status: 'running', last_message_at: now() });
    } else {
      await startTurn(last);
    }
  } catch (err) {
    running.delete(conversationId);
    return engineFailure(err);
  }

  /** A new message: an unanswered approval is denied, then this turn's two messages. */
  async function startTurn(last: StoredMessage | undefined): Promise<void> {
    if (last?.role === 'assistant') {
      const unanswered = denyPendingApprovals(last.parts);
      if (unanswered.length > 0) {
        declined.push(...unanswered);
        await messages.record(last.id).update({ parts: last.parts });
      }
    }
    const seq = (last?.seq ?? 0) + 1;
    const text = message!.text;
    const userBody = {
      seq,
      role: 'user' as const,
      content: text,
      parts: text.trim() ? [{ type: 'text' as const, text }] : [],
      status: 'complete',
      // Files ride on the message itself (the client encodes them as uploads).
      ...(attachments.length > 0 ? { attachments } : {}),
    };
    // A retried send reuses its id, so it lands here as a 409 — not a duplicate.
    history.push(await messages.create(userBody, { id: message!.id }));
    await messages.create(
      { seq: seq + 1, role: 'assistant', content: '', parts: [], status: 'streaming' },
      { id: assistantId },
    );
    await conversations.record(conversationId).update({ status: 'running', last_message_at: now() });
  }

  /** One attached file's bytes, read under the caller's own token. */
  const readAttachment = async (messageId: string, file: FileDescriptor): Promise<Uint8Array> => {
    const blob = await messages.record(messageId).download(file);
    return new Uint8Array(await blob.arrayBuffer());
  };

  // 4. The model's context, rebuilt from storage.
  let modelMessages;
  try {
    const recent = history.slice(-HISTORY_LIMIT);
    const ui = await withAttachments(toUiMessages(recent), recent, readAttachment);
    modelMessages = await convertToModelMessages(ui);
    // The model hears a denial through the context above; the stream reports
    // nothing for it, so the card is settled here.
    if (answered && answered.approval?.approved === false) {
      answered.state = 'output-denied';
      declined.push(answered);
    }
  } catch (err) {
    await finish({ status: 'error', error: `could not rebuild the conversation: ${String(err)}` });
    return problem(500, 'could not rebuild the conversation history');
  }

  // 5. Stream the model, writing the assistant message at each step boundary.
  // The tools are what this person can reach, and file fields take this
  // conversation's attachments — every message's, not only those the model is
  // shown — and nothing else.
  let reachable;
  try {
    reachable = await modelResourcesFor(defs, auth.token);
  } catch (err) {
    await finish({ status: 'error', error: `could not resolve access: ${String(err)}` });
    return problem(500, 'could not resolve what this account can reach');
  }
  const { toolSet: homesteadTools, hasDocSearch } = buildChatToolSet(reachable.defs, auth.token, {
    attachments: attachmentSource(history, readAttachment),
    write: reachable.writable,
  });
  // The outside services shared with this person, through the broker.
  const conversationPath = `${CONVERSATIONS}/${conversationId}`;
  const mcp = await buildMcpToolSet({ token: auth.token, userId: auth.user.id, conversation: conversationPath });
  const toolSet = { ...homesteadTools, ...mcp.toolSet };
  for (const part of declined) {
    const entry = mcp.entries.get(part.type.slice('tool-'.length));
    if (entry) {
      await recordDeniedMcpCall(entry, part.input, { userId: auth.user.id }, conversationPath, part.approval?.reason);
    }
  }
  // What the apps know about the speaker. Bounded: a slow app is left out.
  const offered = new Set(reachable.defs.map((d) => d.singular));
  const household = householdFor(auth.user.id);
  const speakerContext = await appContext(getAllApps(), offered, {
    token: auth.token,
    userId: auth.user.id,
    household,
  });
  const parts: UIMessage['parts'] = resumed ? [...resumed] : [];
  // The reply text of the step in flight. Steps are stored when they end, so
  // without this a stopped turn would lose the words the reader already saw.
  let stepText = '';
  const partsSoFar = (): UIMessage['parts'] =>
    stepText ? [...parts, { type: 'text', text: stepText, state: 'done' }] : parts;
  let result: ReturnType<typeof aiStreamAgent>;
  try {
    result = aiStreamAgent({
      system: buildSystemPrompt(auth.user, {
        now: localNow(resolveTimezone(body.timezone)),
        hasDocSearch,
        appNotes: appNotes(getAllApps(), offered),
        valueTypes: valueTypeLines(getAllApps(), offered),
        household: householdLines(household, auth.user.id),
        appContext: speakerContext,
        outsideServices: mcpPromptLines(mcp.entries),
      }),
      messages: modelMessages,
      tools: toolSet,
      maxRounds: MAX_TOOL_ROUNDS,
      abortSignal: controller.signal,
      onChunk: ({ chunk }: { chunk: StreamChunk }) => {
        if (chunk.type === 'text-delta') stepText += chunk.text ?? '';
        // An approved call runs before the first step, so its outcome is in
        // no step's content: settle it on the part that asked.
        else settleResumedCall(parts, chunk);
      },
      onStepEnd: async (step: { content: readonly StepContent[] }) => {
        stepText = '';
        mergeStep(parts, step.content);
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
