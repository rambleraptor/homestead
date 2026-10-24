/**
 * Stored, streamed chat turns (`core/server/chat/turns.ts`), end to end on the
 * VM tier: the real `/api/chat` handler, the real engine and tools, the AI stub
 * answering from scripts (tests/e2e/config/ai-scripts.ts) in streaming mode.
 *
 * These drive the endpoint directly rather than through the SPA (that's
 * `chat.vm.ts`) and check what landed in storage, which is what every device
 * (and the next turn) reads back.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient } from '../e2e/utils/aepbase-helpers';
import { CHAT_MARKERS, LONG_REPLY_TEXT } from '../e2e/config/ai-scripts';

const APP = process.env.HOMESTEAD_E2E_APP_URL!;

interface Conversation {
  id: string;
  title?: string;
  status?: string;
  last_message_at?: string;
}

interface ChatMessage {
  id: string;
  seq: number;
  role: string;
  content?: string;
  status?: string;
  parts?: Array<Record<string, unknown>>;
  usage?: Record<string, unknown>;
}

let h: Harness;
let token: string;
let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

function send(
  as: string,
  text: string,
  opts: { conversationId?: string; id?: string; signal?: AbortSignal } = {},
): Promise<Response> {
  return fetch(`${APP}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${as}` },
    body: JSON.stringify({
      ...(opts.conversationId ? { conversation_id: opts.conversationId } : {}),
      message: { id: opts.id ?? nextId(), text },
    }),
    signal: opts.signal,
  });
}

/** The UI message stream's events, read to the end. */
async function events(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split('\n\n')
    .map((frame) => frame.replace(/^data: /, '').trim())
    .filter((data) => data && data !== '[DONE]')
    .map((data) => JSON.parse(data) as Record<string, unknown>);
}

const conversations = (as = token) => e2eClient(as).collection<Conversation>('conversations');
const messagesOf = (id: string, as = token) =>
  conversations(as).record(id).collection<ChatMessage>('chat-messages');

/** Poll until `check` passes; turns finish in the background. */
async function eventually<T>(read: () => Promise<T>, check: (v: T) => boolean): Promise<T> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) throw new Error(`timed out; last value: ${JSON.stringify(value)}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const ordered = async (id: string) => messagesOf(id).listAll({ orderBy: 'seq' });

beforeEach(async () => {
  h = await bootHomestead();
  token = h.member.token;
});

afterEach(async () => {
  await h.close();
});

describe('a stored turn', () => {
  test('streams, runs the tools, and stores both messages and the conversation', async () => {
    const res = await send(token, `Add milk to the list ${CHAT_MARKERS.addMilk}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const conversationId = res.headers.get('x-conversation-id')!;
    expect(conversationId).toBeTruthy();

    const stream = await events(res);
    // The streamed message is the stored one: same id, so a client's copy and
    // a later reload agree.
    const [userRecord] = await ordered(conversationId);
    expect(stream[0]).toMatchObject({
      type: 'start',
      messageId: `${userRecord!.id}-reply`,
      messageMetadata: { conversationId, messageId: `${userRecord!.id}-reply` },
    });
    expect(stream.some((e) => e.type === 'tool-output-available')).toBe(true);
    const text = stream.filter((e) => e.type === 'text-delta').map((e) => e.delta).join('');
    expect(text).toBe('Added milk to the grocery list.');

    const conversation = await eventually(
      () => conversations().get(conversationId),
      (c) => c.status === 'idle',
    );
    // A short first message is the title as-is (long ones are trimmed; see turns.test).
    expect(conversation.title).toBe(`Add milk to the list ${CHAT_MARKERS.addMilk}`);
    expect(conversation.last_message_at).toBeTruthy();

    const [user, assistant] = await ordered(conversationId);
    expect(user).toMatchObject({ seq: 1, role: 'user', status: 'complete' });
    expect(assistant).toMatchObject({
      seq: 2,
      role: 'assistant',
      status: 'complete',
      content: 'Added milk to the grocery list.',
    });
    const tool = assistant!.parts!.find((p) => p.type === 'tool-groceries')!;
    expect(tool).toMatchObject({ state: 'output-available', input: { action: 'create' } });
    expect(assistant!.usage).toBeTruthy();

    const groceries = await e2eClient(token).collection<{ name: string }>('groceries').listAll();
    expect(groceries.map((g) => g.name)).toEqual(['Milk']);
  });

  test('the next turn continues the same conversation at the next positions', async () => {
    const first = await send(token, `Add milk ${CHAT_MARKERS.addMilk}`);
    const conversationId = first.headers.get('x-conversation-id')!;
    await events(first);
    await eventually(() => conversations().get(conversationId), (c) => c.status === 'idle');

    const second = await send(token, `Hi ${CHAT_MARKERS.hello}`, { conversationId });
    expect(second.status).toBe(200);
    expect(second.headers.get('x-conversation-id')).toBe(conversationId);
    await events(second);

    const all = await eventually(
      () => ordered(conversationId),
      (ms) => ms.length === 4 && ms[3]!.status === 'complete',
    );
    expect(all.map((m) => [m.seq, m.role])).toEqual([
      [1, 'user'],
      [2, 'assistant'],
      [3, 'user'],
      [4, 'assistant'],
    ]);
    expect(all[3]!.content).toBe('Hello from the scripted assistant. How can I help?');
  });

  test('a retried send is refused as a conflict, not stored twice', async () => {
    const first = await send(token, `Hi ${CHAT_MARKERS.hello}`, { id: 'retry-me' });
    const conversationId = first.headers.get('x-conversation-id')!;
    await events(first);
    await eventually(() => conversations().get(conversationId), (c) => c.status === 'idle');

    const again = await send(token, `Hi ${CHAT_MARKERS.hello}`, { id: 'retry-me', conversationId });
    expect(again.status).toBe(409);
    expect(await ordered(conversationId)).toHaveLength(2);
  });

  test('a malformed request is a 400, the retired whole-transcript shape included', async () => {
    for (const body of [
      { message: { id: '', text: 'x' } },
      { messages: [{ role: 'user', content: 'hi' }] },
    ]) {
      const res = await fetch(`${APP}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
    }
  });
});

describe('one turn at a time, and stopping one', () => {
  test('a second send while a turn runs is refused; it works again afterwards', async () => {
    const running = await send(token, CHAT_MARKERS.longReply);
    const conversationId = running.headers.get('x-conversation-id')!;

    const collide = await send(token, CHAT_MARKERS.hello, { conversationId });
    expect(collide.status).toBe(409);

    await events(running);
    await eventually(() => conversations().get(conversationId), (c) => c.status === 'idle');
    const later = await send(token, CHAT_MARKERS.hello, { conversationId });
    expect(later.status).toBe(200);
    await events(later);
  });

  test(':cancel stops the running turn and records it as cancelled', async () => {
    const running = await send(token, CHAT_MARKERS.longReply);
    const conversationId = running.headers.get('x-conversation-id')!;
    const reader = running.body!.getReader();
    // Under way, and some of the reply already shown.
    const decoder = new TextDecoder();
    for (let seen = ''; !seen.includes('"text-delta"'); ) {
      seen += decoder.decode((await reader.read()).value);
    }

    const cancel = await fetch(`${APP}/api/aep/conversations/${conversationId}:cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(cancel.status).toBe(200);
    expect(await cancel.json()).toEqual({ cancelled: true });
    await reader.cancel().catch(() => {});

    const [, assistant] = await eventually(
      () => ordered(conversationId),
      (ms) => ms[1]?.status === 'cancelled',
    );
    // What had streamed is kept — the reader saw it — and the rest never came.
    expect(assistant!.content!.length).toBeGreaterThan(0);
    expect(assistant!.content!.length).toBeLessThan(LONG_REPLY_TEXT.length);
    expect(LONG_REPLY_TEXT.startsWith(assistant!.content!)).toBe(true);
    await eventually(() => conversations().get(conversationId), (c) => c.status === 'idle');

    // Nothing left to stop: not an error.
    const again = await fetch(`${APP}/api/aep/conversations/${conversationId}:cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(await again.json()).toEqual({ cancelled: false });
  });

  test('a turn finishes and is stored even when the client leaves mid-stream', async () => {
    const leave = new AbortController();
    const running = await send(token, CHAT_MARKERS.longReply, { signal: leave.signal });
    const conversationId = running.headers.get('x-conversation-id')!;
    await running.body!.getReader().read();
    leave.abort();

    const [, assistant] = await eventually(
      () => ordered(conversationId),
      (ms) => ms[1]?.status === 'complete',
    );
    expect(assistant!.content).toBe(LONG_REPLY_TEXT);
  });
});

describe('a conversation is its starter’s alone', () => {
  test('another member can’t read it, post into it, or cancel it', async () => {
    const mine = await send(token, CHAT_MARKERS.hello);
    const conversationId = mine.headers.get('x-conversation-id')!;
    await events(mine);

    const sam = h.householdMember.token;
    await expect(conversations(sam).get(conversationId)).rejects.toMatchObject({ code: 403 });
    await expect(messagesOf(conversationId, sam).listAll()).rejects.toMatchObject({ code: 403 });
    expect((await send(sam, CHAT_MARKERS.hello, { conversationId })).status).toBe(403);
    const cancel = await fetch(`${APP}/api/aep/conversations/${conversationId}:cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sam}` },
    });
    expect(cancel.status).toBe(403);
    expect(await conversations(sam).listAll()).toEqual([]);
  });
});

describe('attachments', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const PDF = new TextEncoder().encode('%PDF-1.7 tickets');

  /** A turn with files: the JSON request plus `attachments` parts. */
  function sendWithFiles(
    text: string,
    files: Array<[name: string, bytes: Uint8Array<ArrayBuffer>, type?: string]>,
    opts: { conversationId?: string; id?: string; extra?: [string, Blob] } = {},
  ): Promise<Response> {
    const form = new FormData();
    form.append(
      'request',
      JSON.stringify({
        ...(opts.conversationId ? { conversation_id: opts.conversationId } : {}),
        message: { id: opts.id ?? nextId(), text },
      }),
    );
    for (const [name, bytes, type] of files) {
      form.append('attachments', new Blob([bytes], { type: type ?? '' }), name);
    }
    if (opts.extra) form.append(opts.extra[0], opts.extra[1], 'x');
    return fetch(`${APP}/api/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  }

  const replyText = (stream: Array<Record<string, unknown>>) =>
    stream.filter((e) => e.type === 'text-delta').map((e) => e.delta).join('');

  test('files reach the model and are stored on the message', async () => {
    const res = await sendWithFiles(`What are these? ${CHAT_MARKERS.describeAttachments}`, [
      ['beach.png', PNG, 'image/png'],
      ['tickets.pdf', PDF, 'application/pdf'],
    ]);
    expect(res.status).toBe(200);
    const conversationId = res.headers.get('x-conversation-id')!;
    expect(replyText(await events(res))).toBe('I can see 1 image and 1 PDF.');

    const [user] = await ordered(conversationId);
    const attachments = (user as unknown as { attachments: Array<Record<string, unknown>> }).attachments;
    expect(attachments.map((a) => [a.name, a.media_type])).toEqual([
      ['beach.png', 'image/png'],
      ['tickets.pdf', 'application/pdf'],
    ]);
  });

  test('a message may be only files; the conversation is titled by them', async () => {
    const res = await sendWithFiles('', [['receipt.png', PNG]]);
    expect(res.status).toBe(200);
    const conversationId = res.headers.get('x-conversation-id')!;
    await events(res);
    expect((await conversations().get(conversationId)).title).toBe('receipt.png');
  });

  test("a file that isn't an image or PDF is refused, whatever it claims to be", async () => {
    const fake = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    const res = await sendWithFiles('hi', [['photo.png', fake, 'image/png']]);
    expect(res.status).toBe(415);
    expect((await res.json()).error.message).toMatch(/isn't an image/);
    // Refused before anything was created.
    expect(await conversations().listAll()).toEqual([]);
  });

  test('too many files, or a stray part, is a 400', async () => {
    const six = Array.from({ length: 6 }, (_, i) => [`${i}.png`, PNG] as [string, Uint8Array<ArrayBuffer>]);
    expect((await sendWithFiles('hi', six)).status).toBe(400);
    const stray = await sendWithFiles('hi', [], { extra: ['photo', new Blob([PNG])] });
    expect(stray.status).toBe(400);
  });
});

describe('stored history is untrusted', () => {
  test('a file part written straight into a message never reaches the model', async () => {
    const first = await send(token, `Hi ${CHAT_MARKERS.hello}`);
    const conversationId = first.headers.get('x-conversation-id')!;
    await events(first);
    await eventually(() => conversations().get(conversationId), (c) => c.status === 'idle');

    // Anyone who can write the conversation can write its messages directly.
    // A file part with a URL would have the server fetch it.
    await messagesOf(conversationId).create(
      {
        seq: 3,
        role: 'user',
        content: 'planted',
        parts: [{ type: 'file', mediaType: 'image/png', url: 'http://169.254.169.254/latest/meta-data' }],
        status: 'complete',
      },
      { id: 'planted' },
    );

    const next = await send(token, `What did you see? ${CHAT_MARKERS.describeAttachments}`, { conversationId });
    expect(next.status).toBe(200);
    await events(next);
    // Had the planted URL been fetched (it can't be reached here), the turn
    // would have failed; `toUiMessages` drops the part (see turns.test.ts).
    const stored = await ordered(conversationId);
    const reply = stored.at(-1)!;
    expect(reply.status).toBe('complete');
  });
});
