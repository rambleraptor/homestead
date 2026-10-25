/**
 * The agentic home (`dashboard.agentic_home`): the assistant front and centre,
 * with a strip of chips for the widgets that matter now, each opening its
 * widget on tap. It sits behind a flag whose audience can be one group, so this
 * also proves the flag reaches only that group.
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

  /** Turn the flag on for the given groups (ids), as Flag Management would. */
  async function enableFor(groupIds: string[] | 'everyone') {
    await e2eClient(h.admin.token).collection('app-flags').create({
      dashboard__agentic_home: true,
      dashboard__agentic_home__audience: groupIds === 'everyone' ? '' : JSON.stringify(groupIds),
    });
  }

  beforeEach(async () => {
    h = await bootHomestead();
  });

  afterEach(async () => {
    await h.close();
  });

  test('is off by default: the classic dashboard, ask box included', async () => {
    await h.loginAs(h.member);
    const dashboard = new DashboardPage(h.driver);
    await h.driver.expect(dashboard.askBox).toBeVisible();
    await h.driver.expect(dashboard.agenticHome).toHaveCount(0);
  });

  test('reaches only the flag\'s audience', async () => {
    await enableFor(['members']);

    await h.loginAs(h.member);
    const dashboard = new DashboardPage(h.driver);
    await h.driver.expect(dashboard.agenticHome).toBeVisible();
    await h.driver.expect(dashboard.askBox).toHaveCount(0);

    // The admin is in Admins, not Members: the classic dashboard, unchanged.
    await h.loginAs(h.admin);
    await h.driver.expect(dashboard.welcomePanel.or(dashboard.adminChecklist)).toBeVisible();
    await h.driver.expect(dashboard.agenticHome).toHaveCount(0);
  });

  test('the first message moves the conversation into the address; a reload keeps it', async () => {
    await enableFor('everyone');
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
    await enableFor('everyone');
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
    await enableFor('everyone');
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

  test("someone who can't use Chat gets the classic dashboard", async () => {
    await enableFor('everyone');
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
    await h.driver.expect(dashboard.welcomePanel).toBeVisible();
    await h.driver.expect(dashboard.agenticHome).toHaveCount(0);
  });

  test('the strip follows the widgets\' summaries, and a chip opens its widget', async () => {
    await enableFor('everyone');
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
    await enableFor('everyone');
    await h.loginAs(h.member);
    const d = h.driver;
    await d.expect(new DashboardPage(d).agenticHome).toBeVisible();
    await d.expect(d.getByRole('main')).toHaveAttribute('data-fill', 'true');
  });
});
