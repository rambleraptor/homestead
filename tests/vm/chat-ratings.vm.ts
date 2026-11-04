/**
 * Rating an assistant reply (`chat-messages/{id}:rate`), end to end on the VM
 * tier: the thumbs under a reply, the eval case the rating files for
 * superusers (Superuser → Eval cases), and taking a rating back.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../e2e/pages/ChatPage';
import { EvalCasesPage } from '../e2e/pages/EvalCasesPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';
import { CHAT_MARKERS } from '../e2e/config/ai-scripts';
import { createGiftCard } from '../../packages/homestead-apps/gift-cards/e2e/helpers';

const APP = process.env.HOMESTEAD_E2E_APP_URL!;

interface EvalCaseRecord {
  id: string;
  rating: string;
  note?: string;
  message?: string;
  conversation?: string;
  rated_by?: string;
  status?: string;
  transcript?: Array<{ id: string; role: string; content?: string; parts?: unknown[] }>;
  context?: { timezone?: string; household?: string[] };
  expected?: string;
}

interface ChatMessageRecord {
  id: string;
  seq: number;
  role: string;
  rating?: string;
}

describe('Rating assistant replies', () => {
  let h: Harness;
  let token: string;
  const evalCases = () => e2eClient(h.admin.token).collection<EvalCaseRecord>('eval-cases');

  async function openConversationId(): Promise<string> {
    await h.driver.expectURL(/\/dashboard\/c\/[^/]+$/);
    return new URL(h.driver.url(), 'http://x').pathname.split('/').pop()!;
  }

  /** The conversation's assistant reply, as stored. */
  async function reply(conversationId: string): Promise<ChatMessageRecord> {
    const messages = await e2eClient(token)
      .collection('conversations')
      .record(conversationId)
      .collection<ChatMessageRecord>('chat-messages')
      .listAll({ orderBy: 'seq' });
    return messages.find((m) => m.role === 'assistant')!;
  }

  function rate(as: string, conversationId: string, messageId: string, body: unknown): Promise<Response> {
    return fetch(`${APP}/api/aep/conversations/${conversationId}/chat-messages/${messageId}:rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${as}` },
      body: JSON.stringify(body),
    });
  }

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test('a thumbs down files the conversation, with a note, for superusers to review', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Add milk to the grocery list ${CHAT_MARKERS.addMilk}`);
    await d.expect(chat.messages).toContainText('Added milk to the grocery list.');
    const conversationId = await openConversationId();

    await chat.rateReply('down');
    await d.expect(chat.ratingNotice).toBeVisible();
    await d.expect(chat.rateButton('down')).toHaveAttribute('aria-pressed', 'true');
    await chat.addRatingNote('It should have asked how much milk.');
    await d.expect(chat.ratingNotice).toContainText('your note was added');

    const rated = await reply(conversationId);
    expect(rated.rating).toBe('down');
    const [filed] = await evalCases().listAll();
    expect(filed).toMatchObject({
      rating: 'down',
      note: 'It should have asked how much milk.',
      status: 'new',
      message: `conversations/${conversationId}/chat-messages/${rated.id}`,
    });
    expect(filed.transcript?.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(JSON.stringify(filed.transcript)).toContain('"action":"create"');
    expect(filed.context?.timezone).toBeTruthy();

    // A superuser reviews it and marks it ready.
    await h.loginAs(h.admin);
    const page = new EvalCasesPage(d);
    await page.goto();
    await d.expect(page.card(filed.id)).toContainText('It should have asked how much milk.');
    await page.review(filed.id, { expected: 'Ask for the quantity before adding.', status: 'ready' });
    await d.expect(page.filter('ready')).toContainText('(1)');
    const reviewed = await evalCases().record(filed.id).get();
    expect(reviewed).toMatchObject({ status: 'ready', expected: 'Ask for the quantity before adding.' });
  });

  test('tapping the same thumb again takes the rating and the case back', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Hi ${CHAT_MARKERS.hello}`);
    await d.expect(chat.messages).toContainText('Hello from the scripted assistant');
    const conversationId = await openConversationId();

    await chat.rateReply('up');
    await d.expect(chat.rateButton('up')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await evalCases().listAll()).map((c) => c.rating)).toEqual(['up']);

    await chat.rateReply('up');
    await d.expect(chat.rateButton('up')).toHaveAttribute('aria-pressed', 'false');
    await d.expect(chat.ratingNotice).toHaveCount(0);
    await expect.poll(async () => (await evalCases().listAll()).length).toBe(0);
    // Merge-patched to null: no rating left on the reply.
    expect((await reply(conversationId)).rating ?? null).toBeNull();
  });

  test('a rating survives a reload, and re-rating updates the one case', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Hi ${CHAT_MARKERS.hello}`);
    await d.expect(chat.messages).toContainText('Hello from the scripted assistant');
    await chat.expectSettled(/Hi/);
    const conversationId = await openConversationId();
    const { id } = await reply(conversationId);

    expect((await rate(token, conversationId, id, { rating: 'up' })).status).toBe(200);
    expect((await rate(token, conversationId, id, { rating: 'down', note: 'Too short.' })).status).toBe(200);
    const cases = await evalCases().listAll();
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ rating: 'down', note: 'Too short.' });

    await d.reload();
    await d.expect(chat.rateButton('down')).toHaveAttribute('aria-pressed', 'true');
  });

  test('encrypted values the assistant read are masked in the case', async () => {
    const number = '4111-2222-3333-4444';
    await createGiftCard(token, { merchant: 'Bookshop', amount: 25, card_number: number, pin: '9876' });
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Anything to do? ${CHAT_MARKERS.lookAround}`);
    await d.expect(chat.messages).toContainText('Nothing needs doing.');
    await chat.expectSettled(/Anything to do/);
    const conversationId = await openConversationId();
    const { id } = await reply(conversationId);

    expect((await rate(token, conversationId, id, { rating: 'down' })).status).toBe(200);
    const [filed] = await evalCases().listAll();
    const stored = JSON.stringify(filed.transcript);
    expect(stored).toContain('Bookshop');
    expect(stored).toContain('[masked]');
    expect(stored).not.toContain(number);
    expect(stored).not.toContain('9876');
  });

  describe('who can rate what', () => {
    test('only the person who had the conversation can rate it', async () => {
      const d = h.driver;
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.send(`Hi ${CHAT_MARKERS.hello}`);
      await d.expect(chat.messages).toContainText('Hello from the scripted assistant');
      await chat.expectSettled(/Hi/);
      const conversationId = await openConversationId();
      const { id } = await reply(conversationId);

      // A superuser can read the conversation but not share it on the member's behalf.
      const res = await rate(h.admin.token, conversationId, id, { rating: 'down' });
      expect(res.status).toBe(403);
      // Another member can't reach it at all.
      const other = await rate(h.householdMember.token, conversationId, id, { rating: 'down' });
      expect([403, 404]).toContain(other.status);
      expect(await evalCases().listAll()).toHaveLength(0);
    });

    test('a person’s own message can’t be rated, and a bad rating is refused', async () => {
      const d = h.driver;
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.send(`Hi ${CHAT_MARKERS.hello}`);
      await d.expect(chat.messages).toContainText('Hello from the scripted assistant');
      await chat.expectSettled(/Hi/);
      const conversationId = await openConversationId();
      const messages = await e2eClient(token)
        .collection('conversations')
        .record(conversationId)
        .collection<ChatMessageRecord>('chat-messages')
        .listAll({ orderBy: 'seq' });
      const mine = messages.find((m) => m.role === 'user')!;
      const theirs = messages.find((m) => m.role === 'assistant')!;

      expect((await rate(token, conversationId, mine.id, { rating: 'up' })).status).toBe(400);
      expect((await rate(token, conversationId, theirs.id, { rating: 'great' })).status).toBe(400);
      expect(await evalCases().listAll()).toHaveLength(0);
    });

    test('members can’t see eval cases, not even the ones they filed', async () => {
      const d = h.driver;
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.send(`Hi ${CHAT_MARKERS.hello}`);
      await d.expect(chat.messages).toContainText('Hello from the scripted assistant');
      await chat.expectSettled(/Hi/);
      const conversationId = await openConversationId();
      const { id } = await reply(conversationId);
      expect((await rate(token, conversationId, id, { rating: 'up' })).status).toBe(200);

      expect(await evalCases().listAll()).toHaveLength(1);
      expect(await e2eClient(token).collection('eval-cases').listAll()).toEqual([]);
      await expect(
        e2eClient(token).collection('eval-cases').create({ rating: 'up' }),
      ).rejects.toMatchObject({ code: 403 });
    });
  });
});
