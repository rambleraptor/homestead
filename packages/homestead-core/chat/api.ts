/**
 * Client side of the chat backend: the transport the AI SDK's `useChat`
 * streams turns through (`POST /api/chat`), plus the conversation reads and
 * the cancel call around it.
 */

import { DefaultChatTransport, type FileUIPart } from 'ai';
import { aepbase, authStore, refreshSession } from '@rambleraptor/homestead-core/api/aepbase';
import { CHAT_MESSAGES, CONVERSATIONS } from './resources';
import type {
  ChatTurnRequest,
  HomesteadUIMessage,
  StoredChatMessage,
} from './types';

/** Thrown when the server has no AI provider configured (HTTP 503). */
export class ChatNotConfiguredError extends Error {
  constructor() {
    super('Chat is not configured on the server');
    this.name = 'ChatNotConfiguredError';
  }
}

/** Raised when a turn request fails before its stream starts. */
export class ChatRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ChatRequestError';
  }
}

/**
 * The server's message from a failed response: `error.message` (the engine's
 * shape), else `message`/`error` strings, else the raw body — always with the
 * status, so nothing reduces to a bare code.
 */
async function errorMessage(res: Response): Promise<string> {
  const raw = (await res.text()).trim();
  let detail = raw;
  try {
    const body = JSON.parse(raw) as {
      error?: string | { message?: string };
      message?: string;
    };
    const nested = typeof body.error === 'object' ? body.error?.message : undefined;
    const flat = [typeof body.error === 'string' ? body.error : undefined, body.message].filter(
      Boolean,
    );
    detail = nested ?? (flat.length > 0 ? flat.join(': ') : raw);
  } catch {
    // Not JSON: the raw text is the message.
  }
  return detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (authStore.needsRenewal) await refreshSession();
  const headers: Record<string, string> = {};
  if (authStore.token) headers.Authorization = `Bearer ${authStore.token}`;
  const userId = authStore.model?.id;
  if (userId) headers['X-User-Id'] = userId;
  return headers;
}

export interface ChatTransportOptions {
  /** The conversation the next turn goes to; null starts a new one. */
  conversationId: () => string | null;
  /** Called as soon as a turn's response names its conversation. */
  onConversation: (id: string) => void;
}

/**
 * A turn with files goes as multipart: the JSON request as a `request` part,
 * each file (from its data URL) as an `attachments` part.
 */
function multipartTurn(json: string, files: readonly FileUIPart[]): FormData {
  const form = new FormData();
  form.append('request', json);
  for (const file of files) {
    form.append('attachments', new File([dataUrlBytes(file.url)], file.filename ?? 'file', { type: file.mediaType }));
  }
  return form;
}

/** The bytes of a `data:` URL — the composer hands files over as these. */
export function dataUrlBytes(url: string): Uint8Array<ArrayBuffer> {
  const match = /^data:[^,]*;base64,(.*)$/s.exec(url);
  if (!match) throw new Error('an attachment must be a base64 data URL');
  const binary = atob(match[1]!);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** The browser's IANA timezone, so the assistant reads "today" as the person does. */
function browserTimezone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The transport for one chat: sends only the newest message (the server owns
 * the history), with its files, and learns a new conversation's id from the
 * response header, before the reply has streamed.
 */
export function createChatTransport(
  options: ChatTransportOptions,
): DefaultChatTransport<HomesteadUIMessage> {
  // The newest message's files, handed from the request builder to `fetch`:
  // the transport only knows JSON bodies. A chat sends one turn at a time.
  let outgoing: FileUIPart[] = [];
  return new DefaultChatTransport<HomesteadUIMessage>({
    api: '/api/chat',
    headers: authHeaders,
    prepareSendMessagesRequest: ({ messages, headers }) => {
      const last = messages.at(-1);
      if (!last || last.role !== 'user') throw new Error('the last message must be the user’s');
      const text = last.parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text)
        .join('\n');
      outgoing = last.parts.filter((p): p is FileUIPart => p.type === 'file');
      const conversationId = options.conversationId();
      const timezone = browserTimezone();
      const body: ChatTurnRequest = {
        ...(conversationId ? { conversation_id: conversationId } : {}),
        message: { id: last.id, text },
        ...(timezone ? { timezone } : {}),
      };
      return { headers, body };
    },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const files = outgoing;
      outgoing = [];
      if (files.length > 0 && typeof init?.body === 'string') {
        // Multipart sets its own Content-Type (with the boundary).
        const headers = new Headers(init.headers);
        headers.delete('Content-Type');
        init = { ...init, headers, body: multipartTurn(init.body, files) };
      }
      const res = await fetch(input, init);
      if (res.status === 503) throw new ChatNotConfiguredError();
      if (!res.ok) throw new ChatRequestError(res.status, await errorMessage(res));
      const id = res.headers.get('X-Conversation-Id');
      if (id) options.onConversation(id);
      return res;
    }) as typeof fetch,
  });
}

/** Stop the turn running in a conversation. False when none was running. */
export async function cancelTurn(conversationId: string): Promise<boolean> {
  const out = await aepbase.customMethod<{ cancelled?: boolean }>(
    CONVERSATIONS,
    'cancel',
    undefined,
    { id: conversationId },
  );
  return out?.cancelled === true;
}

/** A conversation's stored messages, oldest first. */
export function listMessages(conversationId: string): Promise<StoredChatMessage[]> {
  return aepbase.list<StoredChatMessage>(CHAT_MESSAGES, {
    parent: [CONVERSATIONS, conversationId],
    orderBy: 'seq',
  });
}

/**
 * A stored message as a UI message — the same parts a live stream builds, so
 * history renders like the turn did. A message with no parts falls back to
 * its plain text.
 */
export function toUiMessage(stored: StoredChatMessage): HomesteadUIMessage {
  const parts =
    stored.parts && stored.parts.length > 0
      ? stored.parts
      : stored.content
        ? [{ type: 'text' as const, text: stored.content }]
        : [];
  return { id: stored.id, role: stored.role, parts };
}
