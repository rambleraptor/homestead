/**
 * The dashboard's "Ask Homestead" box: a message written there opens a new chat
 * and is sent as its first message, with the reply streaming in on the Chat
 * screen. It's the same stored conversation as any other, and is sent once.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../e2e/pages/ChatPage';
import { DashboardPage } from '../e2e/pages/DashboardPage';
import { createUser, e2eClient } from '../e2e/utils/aepbase-helpers';
import { getAepbaseUrl } from '../e2e/config/aepbase.setup';
import { CHAT_MARKERS } from '../e2e/config/ai-scripts';

interface ConversationRecord {
  id: string;
  title?: string;
}

describe('Ask Homestead on the dashboard', () => {
  let h: Harness;
  let token: string;
  const conversations = () => e2eClient(token).collection<ConversationRecord>('conversations');

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test('a question asked there opens a new chat with the answer, sent once', async () => {
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    await d.expect(dashboard.askBox).toBeVisible();

    await dashboard.ask(`Hi there ${CHAT_MARKERS.hello}`);

    await d.expectURL(/\/chat\/[^/]+$/);
    await d.expect(chat.messages).toContainText('Hello from the scripted assistant. How can I help?');
    await d.expect(chat.userMessages).toHaveCount(1);
    await chat.expectSettled(/Hi there/);

    // A reload shows the stored conversation; nothing is sent again.
    await d.reload();
    await d.expect(chat.assistantMessages).toHaveCount(1);
    await d.expect(chat.userMessages).toHaveCount(1);
    expect(await conversations().listAll()).toHaveLength(1);
  });

  test('a suggestion sends itself the same way', async () => {
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    const first = dashboard.askSuggestions.first();
    const text = (await first.textContent())!.trim();

    await first.click();

    await d.expectURL(/\/chat\/[^/]+$/);
    await d.expect(chat.userMessages.first()).toContainText(text);
    await chat.expectSettled(text);
  });

  test('an attached photo goes with the question', async () => {
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    await dashboard.attachToAsk({
      name: 'beach.png',
      mimeType: 'image/png',
      buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]),
    });

    await dashboard.ask(`What is this? ${CHAT_MARKERS.describeAttachments}`);

    await d.expectURL(/\/chat\/[^/]+$/);
    await d.expect(chat.messages).toContainText('I can see 1 image and 0 PDFs.');
    await d.expect(chat.attachments).toHaveCount(1);
    await chat.expectSettled(/What is this/);
  });

  test("isn't shown to someone who can't use Chat", async () => {
    // A guest with no household role: no grant reaches Chat's conversations.
    const email = `guest-${Date.now()}@example.com`;
    const password = 'guest-vm-password';
    const guest = await createUser(h.admin.token, { email, password, display_name: 'Guest', noRole: true });
    const res = await fetch(`${getAepbaseUrl()}/users/:login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const { token: guestToken } = (await res.json()) as { token: string };
    await h.loginAs({ id: guest.id, email, password, token: guestToken });

    const dashboard = new DashboardPage(h.driver);
    // The widget list is settled in the render that shows the welcome panel:
    // a widget from an app the viewer can't reach is filtered out there.
    await h.driver.expect(dashboard.welcomePanel).toBeVisible();
    await h.driver.expect(dashboard.askBox).toHaveCount(0);
  });
});
