/**
 * The home: the assistant's conversation, held in the address with past ones
 * in a drawer, under a strip of chips for the widgets that matter now. Old
 * Chat links land here, and someone the assistant can't serve gets the home
 * without the conversation.
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
  status?: string;
}

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

describe('Agentic home', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
  });

  afterEach(async () => {
    await h.close();
  });

  test('the first message moves the conversation into the address; a reload keeps it', async () => {
    const { token } = await h.loginAs(h.member);
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    await d.expect(dashboard.agenticHome).toBeVisible();
    await d.expect(dashboard.newChat).toHaveCount(0);

    await chat.send(`Hi there ${CHAT_MARKERS.hello}`);
    await d.expect(chat.messages).toContainText('Hello from the scripted assistant. How can I help?');
    const conversations = e2eClient(token).collection<ConversationRecord>('conversations');
    const [conversation] = await conversations.listAll();
    expect(conversation).toBeTruthy();
    // Still the home, now at the conversation's own address.
    await d.expectURL(new RegExp(`/dashboard/c/${conversation!.id}$`));
    await d.expect(dashboard.agenticHome).toBeVisible();
    await eventually(() => conversations.get(conversation!.id), (c) => c.status === 'idle');

    await d.reload();
    await d.expect(dashboard.agenticHome).toBeVisible();
    await d.expect(chat.userMessages).toHaveCount(1);
    await d.expect(chat.assistantMessages).toHaveCount(1);
  });

  test('New chat starts over; the drawer brings the old one back', async () => {
    const { token } = await h.loginAs(h.member);
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    await d.expect(dashboard.agenticHome).toBeVisible();
    await chat.send(`Hi there ${CHAT_MARKERS.hello}`);
    await d.expect(chat.assistantMessages).toHaveCount(1);
    const conversations = e2eClient(token).collection<ConversationRecord>('conversations');
    const [conversation] = await conversations.listAll();
    await eventually(() => conversations.get(conversation!.id), (c) => c.status === 'idle');

    await dashboard.newChat.click();
    await d.expectURL(/\/dashboard$/);
    await d.expect(chat.userMessages).toHaveCount(0);

    await dashboard.openPastConversation(/Hi there/);
    await d.expectURL(new RegExp(`/dashboard/c/${conversation!.id}$`));
    await d.expect(dashboard.historyDrawer).toHaveCount(0);
    await d.expect(dashboard.agenticHome).toBeVisible();
    await d.expect(chat.assistantMessages).toHaveCount(1);
  });

  test('deleting the open conversation from the drawer starts a new one', async () => {
    const { token } = await h.loginAs(h.member);
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    await d.expect(dashboard.agenticHome).toBeVisible();
    await chat.send(`Hi there ${CHAT_MARKERS.hello}`);
    await d.expect(chat.assistantMessages).toHaveCount(1);
    const conversations = e2eClient(token).collection<ConversationRecord>('conversations');
    const [conversation] = await conversations.listAll();
    await eventually(() => conversations.get(conversation!.id), (c) => c.status === 'idle');

    await dashboard.historyButton.click();
    await dashboard.historyConversation(/Hi there/).getByTestId('chat-conversation-delete').click();
    await d.getByRole('button', { name: 'Delete', exact: true }).click();

    await d.expectURL(/\/dashboard$/);
    await d.expect(dashboard.historyConversation(/Hi there/)).toHaveCount(0);
    expect(await conversations.listAll()).toEqual([]);
  });

  test('old Chat links open the home, and the same conversation on it', async () => {
    const { token } = await h.loginAs(h.member);
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    // A conversation from elsewhere (another device, through the API).
    const res = await fetch(`${process.env.HOMESTEAD_E2E_APP_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: { id: 'elsewhere-1', text: `Hi ${CHAT_MARKERS.hello}` } }),
    });
    const id = res.headers.get('x-conversation-id')!;
    await res.text();

    await d.goto('/chat');
    await d.expectURL(/\/dashboard$/);
    await d.expect(dashboard.agenticHome).toBeVisible();

    await d.goto(`/chat/${id}`);
    await d.expectURL(new RegExp(`/dashboard/c/${id}$`));
    await d.expect(chat.assistantMessages).toHaveCount(1);
  });

  test('the top bar has no Chat icon: the home is the chat', async () => {
    await h.loginAs(h.member);
    const d = h.driver;
    await d.expect(new DashboardPage(d).agenticHome).toBeVisible();
    await d.expect(d.getByTestId('topbar-app-notifications')).toBeVisible();
    await d.expect(d.getByTestId('topbar-app-chat')).toHaveCount(0);
  });

  test("someone who can't use Chat gets the home without the conversation", async () => {
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

    const d = h.driver;
    const dashboard = new DashboardPage(d);
    await d.expect(dashboard.assistantUnavailable).toHaveAttribute('data-reason', 'no-access');
    await d.expect(dashboard.agenticHome).toBeVisible();
    await d.expect(new ChatPage(d).input).toHaveCount(0);
    await d.expect(dashboard.historyButton).toHaveCount(0);
  });

  test('the strip follows the widgets\' summaries, and a chip opens its widget', async () => {
    const { token } = await h.loginAs(h.member);
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    await d.expect(dashboard.agenticHome).toBeVisible();

    // Nothing to buy: the groceries chip has nothing to say and stays off.
    await d.expect(dashboard.strip).toBeVisible();
    await d.expect(dashboard.widgetChip('groceries-remaining')).toHaveCount(0);
    await d.expect(dashboard.widgetChip('chat-ask')).toHaveCount(0);

    await e2eClient(token).collection('groceries').create({ name: 'Milk', checked: false });
    await d.reload();
    const chip = dashboard.widgetChip('groceries-remaining');
    await d.expect(chip).toBeVisible();
    await d.expect(chip).toContainText('1 item left to buy');

    // The widget itself is a tap away, and a second tap puts it back.
    await d.expect(dashboard.widgetPanel).toHaveCount(0);
    await chip.click();
    await d.expect(dashboard.widgetPanel.getByTestId('groceries-widget')).toBeVisible();
    await d.expect(chip).toHaveAttribute('aria-expanded', 'true');
    await chip.click();
    await d.expect(dashboard.widgetPanel).toHaveCount(0);
  });

  test('fills the screen: no shell padding around the thread', async () => {
    await h.loginAs(h.member);
    const d = h.driver;
    await d.expect(new DashboardPage(d).agenticHome).toBeVisible();
    await d.expect(d.getByRole('main')).toHaveAttribute('data-fill', 'true');
  });
});
