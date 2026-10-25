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
import { e2eClient } from '../e2e/utils/aepbase-helpers';
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

  test('the conversation runs in place, with a way to the Chat screen', async () => {
    await enableFor('everyone');
    const { token } = await h.loginAs(h.member);
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    await d.expect(dashboard.agenticHome).toBeVisible();

    await chat.send(`Hi there ${CHAT_MARKERS.hello}`);
    await d.expect(chat.messages).toContainText('Hello from the scripted assistant. How can I help?');
    // Still the home: the thread stays here, with a way to the Chat screen.
    await d.expectURL(/\/dashboard$/);
    const conversations = e2eClient(token).collection<ConversationRecord>('conversations');
    const [conversation] = await conversations.listAll();
    expect(conversation).toBeTruthy();
    await d.expect(dashboard.openInChat).toHaveAttribute('href', `/chat/${conversation!.id}`);
    await eventually(() => conversations.get(conversation!.id), (c) => c.status === 'idle');
  });

  test('a new visit starts a new conversation; the old one is in Chat', async () => {
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

    await d.reload();
    await d.expect(dashboard.agenticHome).toBeVisible();
    await d.expect(chat.userMessages).toHaveCount(0);
    await d.expect(dashboard.openInChat).toHaveCount(0);
    await chat.goto();
    await d.expect(chat.conversation(/Hi there/)).toHaveCount(1);
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
