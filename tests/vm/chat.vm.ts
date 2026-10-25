/**
 * The chat assistant, end to end on the VM tier: a message goes to the real
 * `/api/chat` handler, the model (the AI stub, answering from a script in
 * tests/e2e/config/ai-scripts.ts) calls the real per-resource tools, and the
 * reply streams back into the transcript. Conversations are stored, so each
 * spec also checks what a reload, the list, or another device sees.
 */

import { afterEach, beforeEach, describe, test, expect } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../e2e/pages/ChatPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';
import { CHAT_MARKERS, LONG_REPLY_TEXT } from '../e2e/config/ai-scripts';

interface GroceryItemRecord {
  id: string;
  name: string;
  checked: boolean;
}

interface ConversationRecord {
  id: string;
  title?: string;
  status?: string;
}

interface ChatMessageRecord {
  id: string;
  seq: number;
  role: string;
  status?: string;
}

const APP = process.env.HOMESTEAD_E2E_APP_URL!;

describe('Chat', () => {
  let h: Harness;
  let token: string;
  const conversations = () => e2eClient(token).collection<ConversationRecord>('conversations');
  const messagesOf = (id: string) =>
    conversations().record(id).collection<ChatMessageRecord>('chat-messages');

  /** The id of the conversation the page has moved to. */
  async function openConversationId(d: Harness['driver']): Promise<string> {
    await d.expectURL(/\/chat\/[^/]+$/);
    return new URL(d.url(), 'http://x').pathname.split('/').pop()!;
  }

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test('a tool call the assistant makes really changes the data, and the transcript shows it', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();

    await chat.send(`Add milk to the grocery list ${CHAT_MARKERS.addMilk}`);

    await d.expect(chat.messages).toContainText('Added milk to the grocery list.');
    await d.expect(chat.toolCalls).toHaveCount(1);
    await d.expect(chat.toolCalls.first()).toContainText('groceries · create');
    await d.expect(chat.toolCalls.first()).toContainText('Completed');
    await d.expect(chat.pending).toHaveCount(0);
    await chat.expectSettled(/Add milk to the grocery list/);

    // Opening the card shows what the tool was sent and what came back.
    await chat.openToolCall();
    await d.expect(chat.toolCalls.first()).toContainText('Parameters');
    await d.expect(chat.toolCalls.first()).toContainText('"action": "create"');
    await d.expect(chat.toolCalls.first()).toContainText('Result');
    await d.expect(chat.toolCalls.first()).toContainText('"name": "Milk"');

    const items = await e2eClient(token).collection<GroceryItemRecord>('groceries').listAll();
    expect(items.map((i) => i.name)).toEqual(['Milk']);

    // …and the app that owns the data shows it.
    await d.goto('/groceries');
    await d.expect(d.getByText('Milk')).toBeVisible();
  });

  test('a filtered list read runs as the scripted query and reads nothing it should not', async () => {
    const d = h.driver;
    const groceries = e2eClient(token).collection<GroceryItemRecord>('groceries');
    await groceries.create({ name: 'Eggs', checked: false });
    await groceries.create({ name: 'Bread', checked: true });

    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`What's still on the list? ${CHAT_MARKERS.listUnchecked}`);

    await d.expect(chat.messages).toContainText('Here is what is still on the list.');
    await d.expect(chat.toolCalls.first()).toContainText('groceries · list');
    await chat.expectSettled(/still on the list/);
    // A read leaves the data as it was.
    expect((await groceries.listAll()).map((i) => i.name).sort()).toEqual(['Bread', 'Eggs']);
  });

  test('a person is found by a first name or a nickname, not only a full name', async () => {
    const d = h.driver;
    const people = e2eClient(token).collection<{ id: string; name: string }>('people');
    await people.create({ name: 'Jake Miller' });
    await people.create({ name: 'Jacob Stone', aliases: ['Jakey'] });
    await people.create({ name: 'Sam Jones' });

    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`What's Jake's address? ${CHAT_MARKERS.findPerson}`);

    await d.expect(chat.messages).toContainText('Here is who I found.');
    await d.expect(chat.toolCalls.first()).toContainText('people · list');
    await d.expect(chat.toolCalls.first()).toContainText('Completed');
    await chat.openToolCall();
    await d.expect(chat.toolCalls.first()).toContainText('"name": "Jake Miller"');
    await d.expect(chat.toolCalls.first()).toContainText('"name": "Jacob Stone"');
    await d.expect(chat.toolCalls.first()).not.toContainText('Sam Jones');
    await chat.expectSettled(/Jake's address/);
  });

  test('a plain reply needs no tool at all', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Hi there ${CHAT_MARKERS.hello}`);

    await d.expect(chat.messages).toContainText('Hello from the scripted assistant. How can I help?');
    await d.expect(chat.toolCalls).toHaveCount(0);
    await chat.expectSettled(/Hi there/);
  });

  // These two use the short reply on purpose: what they check is the stored
  // conversation, not streaming, and a 200-word reply plus a reload plus a
  // second turn was more than the 5s budget on a busy CI runner. The long
  // reply stays with the stop and interrupt specs, where its length matters.
  test('the first message starts a stored conversation that a reload brings back', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Hi there ${CHAT_MARKERS.hello}`);

    // The page moves to the new conversation as soon as it exists.
    const id = await openConversationId(d);
    await d.expect(chat.messages).toContainText('Hello from the scripted assistant.');
    await d.expect(chat.conversation(`Hi there ${CHAT_MARKERS.hello}`)).toHaveCount(1);
    await chat.expectSettled(/Hi there/);

    await d.reload();
    await d.expect(chat.userMessages).toHaveCount(1);
    await d.expect(chat.assistantMessages).toHaveCount(1);
    await d.expect(chat.messages).toContainText('Hello from the scripted assistant.');
    expect(new URL(d.url(), 'http://x').pathname).toBe(`/chat/${id}`);
    expect((await messagesOf(id).listAll()).map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  test('a message sent after a reload continues the same conversation', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Hi there ${CHAT_MARKERS.hello}`);
    const id = await openConversationId(d);
    await d.expect(chat.assistantMessages).toHaveCount(1);
    await chat.expectSettled(/Hi there/);

    await d.reload();
    await d.expect(chat.assistantMessages).toHaveCount(1);
    await chat.send(`And hello again ${CHAT_MARKERS.hello}`);
    await d.expect(chat.assistantMessages).toHaveCount(2);
    expect(new URL(d.url(), 'http://x').pathname).toBe(`/chat/${id}`);
    await chat.expectSettled(/Hi there/);
    expect(await conversations().listAll()).toHaveLength(1);
    expect((await messagesOf(id).listAll()).map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  });

  test('stop ends the turn here and on the server', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(CHAT_MARKERS.longReply);
    const id = await openConversationId(d);

    await chat.stop();

    await d.expect(chat.stoppedNote).toBeVisible();
    await chat.expectSettled(CHAT_MARKERS.longReply);
    await d.expect(chat.messages).not.toContainText(LONG_REPLY_TEXT.split(' ').slice(-3).join(' '));
    const assistant = (await messagesOf(id).listAll()).find((m) => m.role === 'assistant');
    expect(assistant?.status).toBe('cancelled');
    // The composer is ready for the next message.
    await d.expect(d.getByRole('button', { name: 'Submit' })).toBeVisible();
  });

  test('a message typed while a reply streams waits in the composer', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(CHAT_MARKERS.longReply);
    await openConversationId(d);

    await chat.input.fill('and then?');
    await chat.input.press('Enter');

    await d.expect(chat.input).toHaveValue('and then?');
    await d.expect(chat.userMessages).toHaveCount(1);
    await chat.expectSettled(CHAT_MARKERS.longReply);
  });

  describe('attachments', () => {
    const png = {
      name: 'beach.png',
      mimeType: 'image/png',
      buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
    };
    const pdf = { name: 'tickets.pdf', mimeType: 'application/pdf', buffer: new TextEncoder().encode('%PDF-1.7 x') };

    test('photos and PDFs go with the message, reach the assistant, and stay after a reload', async () => {
      const d = h.driver;
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.attach([png, pdf]);
      await d.expect(chat.composerAttachments).toHaveCount(2);

      await chat.send(`What are these? ${CHAT_MARKERS.describeAttachments}`);
      await d.expect(chat.messages).toContainText('I can see 1 image and 1 PDF.');
      await d.expect(chat.composerAttachments).toHaveCount(0);
      await d.expect(chat.attachments).toHaveCount(2);
      await chat.expectSettled(/What are these/);

      await d.reload();
      await d.expect(chat.attachments).toHaveCount(2);
      await d.expect(chat.attachments.first()).toHaveAttribute('title', 'beach.png');
    });

    test('an attached photo can be saved into an app', async () => {
      const d = h.driver;
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.attach({ ...png, name: 'card.png' });
      await chat.send(`Save this gift card ${CHAT_MARKERS.fileGiftCard}`);

      await d.expect(chat.messages).toContainText('Saved the REI gift card with its photo.');
      await d.expect(chat.toolCalls.first()).toContainText('gift_cards · create');
      await chat.expectSettled(/Save this gift card/);
      const cards = await e2eClient(token).collection<{ front_image?: string }>('gift-cards').listAll();
      expect(cards).toHaveLength(1);
      expect(cards[0]!.front_image).toBeTruthy();
    });

    test('a message can be only a photo', async () => {
      const d = h.driver;
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.attach(png);
      await chat.sendButton.click();

      await d.expect(chat.attachments).toHaveCount(1);
      await d.expect(chat.assistantMessages).toHaveCount(1);
      await chat.expectSettled('beach.png');
    });

    test('a file can be taken back out before sending', async () => {
      const chat = new ChatPage(h.driver);
      await chat.goto();
      await chat.attach([png, pdf]);
      await chat.removeAttachment('beach.png');
      await h.driver.expect(chat.composerAttachments).toHaveCount(1);
      await h.driver.expect(chat.composerAttachments.first()).toContainText('tickets.pdf');
    });

    test('a file the assistant cannot read is turned away with a reason', async () => {
      const d = h.driver;
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.attach({ name: 'notes.txt', mimeType: 'text/plain', buffer: new TextEncoder().encode('hi') });
      await d.expect(d.getByText('Only photos (JPEG, PNG, WebP, GIF) and PDFs can be attached.')).toBeVisible();
      await d.expect(chat.composerAttachments).toHaveCount(0);
    });
  });

  test('a starter prompt sends itself', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.suggestion('Add milk to the grocery list').click();

    await d.expect(chat.userMessages).toHaveCount(1);
    await d.expect(chat.userMessages.first()).toContainText('Add milk to the grocery list');
    await d.expect(chat.assistantMessages).toHaveCount(1);
    await chat.expectSettled('Add milk to the grocery list');
  });

  test('a turn from another device appears without a reload', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);

    // Started elsewhere — the same person, through the API.
    const first = await fetch(`${APP}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: { id: 'phone-1', text: `Hi ${CHAT_MARKERS.hello}` } }),
    });
    const id = first.headers.get('x-conversation-id')!;
    await first.text();

    await chat.goto(id);
    await d.expect(chat.assistantMessages).toHaveCount(1);

    const second = await fetch(`${APP}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        conversation_id: id,
        message: { id: 'phone-2', text: `Add milk ${CHAT_MARKERS.addMilk}` },
      }),
    });
    await second.text();

    await d.expect(chat.assistantMessages).toHaveCount(2);
    await d.expect(chat.messages).toContainText('Added milk to the grocery list.');
    await chat.expectSettled(/Hi/);
  });

  test('deleting a conversation removes it and its messages', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Hi ${CHAT_MARKERS.hello}`);
    const id = await openConversationId(d);
    await d.expect(chat.assistantMessages).toHaveCount(1);
    await chat.expectSettled(/Hi/);

    await chat.deleteConversation(`Hi ${CHAT_MARKERS.hello}`);

    await d.expect(chat.conversations).toHaveCount(0);
    await d.waitForURL('/chat');
    await d.expect(chat.userMessages).toHaveCount(0);
    expect(await conversations().listAll()).toEqual([]);
    // Gone, messages and all: the private record no longer answers at all.
    await expect(messagesOf(id).listAll()).rejects.toMatchObject({ code: 403 });
  });
});
