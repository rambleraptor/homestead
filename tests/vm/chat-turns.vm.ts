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
import { createUser, e2eClient } from '../e2e/utils/aepbase-helpers';
import { getAepbaseUrl } from '../e2e/config/aepbase.setup';
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
  opts: { conversationId?: string; id?: string; signal?: AbortSignal; timezone?: string } = {},
): Promise<Response> {
  return fetch(`${APP}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${as}` },
    body: JSON.stringify({
      ...(opts.conversationId ? { conversation_id: opts.conversationId } : {}),
      message: { id: opts.id ?? nextId(), text },
      ...(opts.timezone !== undefined ? { timezone: opts.timezone } : {}),
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

/** A fresh session for an account, as its login form would get one. */
async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${getAepbaseUrl()}/users/:login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

/** The reply's text, from a stream's deltas. */
const replyText = (stream: Array<Record<string, unknown>>) =>
  stream.filter((e) => e.type === 'text-delta').map((e) => e.delta).join('');

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

describe('the tools a turn offers', () => {
  /** The tools the model was offered, by name, each with its actions. */
  async function offered(as: string): Promise<Map<string, string>> {
    const res = await send(as, `What can you do? ${CHAT_MARKERS.listTools}`);
    expect(res.status).toBe(200);
    const conversationId = res.headers.get('x-conversation-id')!;
    const summary = replyText(await events(res));
    await eventually(() => conversations(as).get(conversationId), (c) => c.status === 'idle');
    return new Map(
      summary.split(' | ').map((tool) => {
        const [, name, actions = ''] = /^([^(]+)(?:\((.*)\))?$/.exec(tool)!;
        return [name!, actions];
      }),
    );
  }

  test("leave out a method hidden from chat: messages wait for the approval card", async () => {
    const tools = await offered(token);
    expect(tools.get('notifications')).toMatch(/\blist\b/);
    expect(tools.get('notifications')).not.toMatch(/\bsend\b/);
  });

  test('are what the person can reach', async () => {
    const before = await offered(token);
    expect(before.get('gift_cards')).toMatch(/^list get create update delete/);
    expect(before.has('transactions')).toBe(true);

    await e2eClient(h.admin.token).collection('access-grants').create({
      subject_type: 'user',
      subject_id: h.member.id,
      target_scope: 'collection',
      resource_type: 'gift-card',
      capability: 'read',
      effect: 'deny',
    });
    const after = await offered(token);
    // Gone, with the transactions beneath it; everything else stays.
    expect(after.has('gift_cards')).toBe(false);
    expect(after.has('transactions')).toBe(false);
    expect(after.get('groceries')).toMatch(/^list get create update delete/);
  });

  test("offer reads alone where the person can't write", async () => {
    // A guest: no household role. They may use chat, and read gift cards.
    const email = `guest-${Date.now()}@example.com`;
    const password = 'guest-vm-password';
    const guest = await createUser(h.admin.token, { email, password, display_name: 'Guest', noRole: true });
    const grants = e2eClient(h.admin.token).collection('access-grants');
    const allow = { subject_type: 'user', subject_id: guest.id, effect: 'allow' };
    await grants.create({ ...allow, target_scope: 'collection', resource_type: 'conversation', capability: 'write' });
    await grants.create({ ...allow, target_scope: 'collection', resource_type: 'gift-card', capability: 'read' });

    const tools = await offered(await login(email, password));
    expect(tools.get('gift_cards')).toBe('list get');
    expect(tools.get('transactions')).toBe('list get');
    expect(tools.has('groceries')).toBe(false);
  });
});

describe('what a turn tells the model', () => {
  /** The prompt's clock, app notes, household and app context, as the model received them. */
  async function context(
    as: string,
    timezone?: string,
  ): Promise<{ now: string; notes: string; household: string; known: string }> {
    const res = await send(as, `Where am I? ${CHAT_MARKERS.describeContext}`, { timezone });
    expect(res.status).toBe(200);
    const conversationId = res.headers.get('x-conversation-id')!;
    const summary = replyText(await events(res));
    await eventually(() => conversations(as).get(conversationId), (c) => c.status === 'idle');
    const fields = new Map(
      summary.split(' | ').map((part) => {
        const eq = part.indexOf('=');
        return [part.slice(0, eq), part.slice(eq + 1)] as const;
      }),
    );
    return {
      now: fields.get('now') ?? '',
      notes: fields.get('notes') ?? '',
      household: fields.get('household') ?? '',
      known: fields.get('known') ?? '',
    };
  }

  const CLOCK = /^[A-Z][a-z]+day \d{4}-\d{2}-\d{2}, \d{1,2}:\d{2} [AP]M /;

  test('the clock is where the person is', async () => {
    const chicago = await context(token, 'America/Chicago');
    expect(chicago.now).toMatch(CLOCK);
    expect(chicago.now).toMatch(/\(America\/Chicago\)$/);
    // Omitted or unrecognized, it's UTC; a bad zone doesn't fail the turn.
    expect((await context(token)).now).toMatch(/\(UTC\)$/);
    expect((await context(token, 'Not/A_Zone')).now).toMatch(/\(UTC\)$/);
  });

  test("a timezone that isn't a string is refused", async () => {
    const res = await fetch(`${APP}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: { id: nextId(), text: 'hi' }, timezone: 5 }),
    });
    expect(res.status).toBe(400);
  });

  test('app notes come from the apps the person can use', async () => {
    expect((await context(token)).notes).toBe('People, Todos');

    // A guest who may only chat and read gift cards loses People's note. Todos
    // stays: their own personal todos live in their user subtree, so that
    // tool is still theirs.
    const email = `guest-${Date.now()}@example.com`;
    const password = 'guest-vm-password';
    const guest = await createUser(h.admin.token, { email, password, display_name: 'Guest', noRole: true });
    const grants = e2eClient(h.admin.token).collection('access-grants');
    const allow = { subject_type: 'user', subject_id: guest.id, effect: 'allow' };
    await grants.create({ ...allow, target_scope: 'collection', resource_type: 'conversation', capability: 'write' });
    await grants.create({ ...allow, target_scope: 'collection', resource_type: 'gift-card', capability: 'read' });
    expect((await context(await login(email, password))).notes).toBe('Todos');
  });

  test('the household is everyone else who shares the Homestead, by name', async () => {
    expect((await context(token)).household).toBe('Admin, Sam');
    expect((await context(h.householdMember.token)).household).toBe('Admin, VM Member');

    // A guest is told no one's name.
    const email = `guest-${Date.now()}@example.com`;
    const password = 'guest-vm-password';
    const guest = await createUser(h.admin.token, { email, password, display_name: 'Guest', noRole: true });
    await e2eClient(h.admin.token).collection('access-grants').create({
      subject_type: 'user',
      subject_id: guest.id,
      effect: 'allow',
      target_scope: 'collection',
      resource_type: 'conversation',
      capability: 'write',
    });
    const guestToken = await login(email, password);
    expect((await context(guestToken)).household).toBe('(none)');
    // Nor does the household gain them: members still see the same people.
    expect((await context(token)).household).toBe('Admin, Sam');
  });

  test('People tells the model who the speaker is, and their family', async () => {
    expect((await context(token)).known).toContain("The signed-in user isn't linked to a person yet.");

    const sam = h.householdMember;
    const people = e2eClient(token).collection<{ id: string }>('people');
    const alex = await people.create({ name: 'Alex', user: `users/${h.member.id}` });
    const partner = await people.create({ name: 'Sam', user: `users/${sam.id}` });
    const kid = await people.create({ name: 'Jordan' });
    const links = e2eClient(token).collection('person-relationships');
    await links.create({ kind: 'partner', person_a: alex.id, person_b: partner.id });
    await links.create({ kind: 'parent', person_a: alex.id, person_b: kid.id });

    expect((await context(token)).known).toBe(
      [
        `You are "Alex" (person id "${alex.id}", user id "${h.member.id}").`,
        `Your partner: "Sam" (person id "${partner.id}", user id "${sam.id}").`,
        `Your children: "Jordan" (person id "${kid.id}").`,
      ].join(' / '),
    );
    expect((await context(sam.token)).known).toContain(
      `Your partner: "Alex" (person id "${alex.id}", user id "${h.member.id}").`,
    );
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

  test("an attachment is filed into an app's file field", async () => {
    const res = await sendWithFiles(`Save this gift card ${CHAT_MARKERS.fileGiftCard}`, [
      ['card.png', PNG, 'image/png'],
    ]);
    expect(res.status).toBe(200);
    expect(replyText(await events(res))).toBe('Saved the REI gift card with its photo.');

    const cards = await e2eClient(token).collection<{ id: string; merchant: string; front_image?: string }>('gift-cards').listAll();
    expect(cards.map((c) => c.merchant)).toEqual(['REI']);
    expect(cards[0]!.front_image).toBeTruthy();
    const image = await e2eClient(token).collection('gift-cards').record(cards[0]!.id).download('front_image');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
  });

  test('a file field can only take an attachment from this conversation', async () => {
    // The script files "the first attachment of the latest message" — here
    // there is none, so the tool call names an id the conversation doesn't have.
    const res = await send(token, `Save this gift card ${CHAT_MARKERS.fileGiftCard}`);
    const conversationId = res.headers.get('x-conversation-id')!;
    const stream = await events(res);
    const failed = stream.find((e) => e.type === 'tool-output-available') as
      | { output?: { error?: string } }
      | undefined;
    expect(failed?.output?.error).toMatch(/no attachment .* in this conversation/);
    expect(await e2eClient(token).collection('gift-cards').listAll()).toEqual([]);
    await eventually(() => conversations().get(conversationId), (c) => c.status === 'idle');
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
