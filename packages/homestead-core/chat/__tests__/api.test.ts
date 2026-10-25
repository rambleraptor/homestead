/**
 * The chat transport speaks the stored-turn protocol: only the newest message
 * goes up, with the conversation it belongs to, and a failed request becomes
 * an error the screen can explain.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomesteadUIMessage } from '../types';

vi.mock('@rambleraptor/homestead-core/api/aepbase', () => ({
  aepbase: { list: vi.fn(), customMethod: vi.fn() },
  authStore: { token: 'tok', needsRenewal: false, model: { id: 'u1' } },
  refreshSession: vi.fn(),
}));

const { createChatTransport, ChatNotConfiguredError, ChatRequestError, toUiMessage } = await import(
  '../api'
);

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const user = (id: string, text: string): HomesteadUIMessage => ({
  id,
  role: 'user',
  parts: [{ type: 'text', text }],
});

function send(transport: ReturnType<typeof createChatTransport>, messages: HomesteadUIMessage[]) {
  return transport.sendMessages({
    chatId: 'chat',
    messages,
    trigger: 'submit-message',
    messageId: undefined,
    abortSignal: undefined,
  });
}

const stream = (headers: Record<string, string> = {}) =>
  new Response('data: {"type":"start"}\n\n', {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', ...headers },
  });

describe('createChatTransport', () => {
  it('sends only the newest message, with auth, into the current conversation', async () => {
    fetchMock.mockResolvedValueOnce(stream());
    const transport = createChatTransport({ conversationId: () => 'c1', onConversation: vi.fn() });

    await send(transport, [user('m1', 'earlier'), user('m2', 'add milk')]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/chat');
    expect(JSON.parse(init.body as string)).toEqual({
      conversation_id: 'c1',
      message: { id: 'm2', text: 'add milk' },
      // So the assistant reads "today" as the person does.
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok', 'x-user-id': 'u1' });
  });

  it('starts a new conversation and learns its id from the response', async () => {
    fetchMock.mockResolvedValueOnce(stream({ 'X-Conversation-Id': 'c9' }));
    const onConversation = vi.fn();
    const transport = createChatTransport({ conversationId: () => null, onConversation });

    await send(transport, [user('m1', 'hello')]);

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      message: { id: 'm1', text: 'hello' },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(onConversation).toHaveBeenCalledWith('c9');
  });

  it('reports an unconfigured server as such', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    const transport = createChatTransport({ conversationId: () => null, onConversation: vi.fn() });
    await expect(send(transport, [user('m1', 'hi')])).rejects.toBeInstanceOf(ChatNotConfiguredError);
  });

  it("surfaces the server's message for a refused turn", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { error: { code: 409, message: 'a turn is already running in this conversation' } },
        { status: 409 },
      ),
    );
    const transport = createChatTransport({ conversationId: () => 'c1', onConversation: vi.fn() });
    const err = await send(transport, [user('m1', 'hi')]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatRequestError);
    expect((err as Error).message).toBe(
      'HTTP 409: a turn is already running in this conversation',
    );
  });
});

describe('toUiMessage', () => {
  it('keeps stored parts, so history renders like the live turn did', () => {
    const parts: HomesteadUIMessage['parts'] = [
      { type: 'step-start' },
      { type: 'text', text: 'Done.', state: 'done' },
    ];
    expect(toUiMessage({ id: 'a', seq: 2, role: 'assistant', parts })).toEqual({
      id: 'a',
      role: 'assistant',
      parts,
    });
  });

  it('falls back to the plain content', () => {
    expect(toUiMessage({ id: 'u', seq: 1, role: 'user', content: 'hi', parts: [] }).parts).toEqual([
      { type: 'text', text: 'hi' },
    ]);
  });
});
