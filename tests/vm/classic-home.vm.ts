/**
 * The classic dashboard, for the `dashboard.classic_home` flag's audience: the
 * widget stack with an Ask box, in place of the assistant's home. The flag's
 * audience can be one group, so this also proves it reaches only that group,
 * and that a conversation started from the Ask box opens on the home's own
 * conversation address.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../e2e/pages/ChatPage';
import { DashboardPage } from '../e2e/pages/DashboardPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';
import { CHAT_MARKERS } from '../e2e/config/ai-scripts';

interface ConversationRecord {
  id: string;
}

describe('Classic dashboard', () => {
  let h: Harness;

  /** Turn the flag on for the given groups (ids), as Flag Management would. */
  async function classicFor(audience: string[] | 'everyone') {
    await e2eClient(h.admin.token).collection('app-flags').create({
      dashboard__classic_home: true,
      dashboard__classic_home__audience: audience === 'everyone' ? '' : JSON.stringify(audience),
    });
  }

  beforeEach(async () => {
    h = await bootHomestead();
  });

  afterEach(async () => {
    await h.close();
  });

  test("reaches only the flag's audience; everyone else keeps the assistant's home", async () => {
    await classicFor(['members']);

    await h.loginAs(h.member);
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    await d.expect(dashboard.classicHome).toBeVisible();
    await d.expect(dashboard.agenticHome).toHaveCount(0);
    await d.expect(d.getByTestId('groceries-widget')).toBeVisible();

    await h.loginAs(h.admin);
    await d.expect(dashboard.agenticHome).toBeVisible();
    await d.expect(dashboard.classicHome).toHaveCount(0);
  });

  test('off by default', async () => {
    await h.loginAs(h.member);
    const dashboard = new DashboardPage(h.driver);
    await h.driver.expect(dashboard.agenticHome).toBeVisible();
    await h.driver.expect(dashboard.classicHome).toHaveCount(0);
  });

  test('the Ask box starts a conversation on its own address; New chat comes back', async () => {
    await classicFor('everyone');
    const { token } = await h.loginAs(h.member);
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    await d.expect(dashboard.askBox).toBeVisible();

    await dashboard.ask(`Hi there ${CHAT_MARKERS.hello}`);

    const conversations = e2eClient(token).collection<ConversationRecord>('conversations');
    await d.expect(chat.messages).toContainText('Hello from the scripted assistant. How can I help?');
    const [conversation] = await conversations.listAll();
    await d.expectURL(new RegExp(`/dashboard/c/${conversation!.id}$`));
    await d.expect(chat.userMessages).toHaveCount(1);
    await chat.expectSettled(/Hi there/);

    await dashboard.newChat.click();
    await d.expectURL(/\/dashboard$/);
    await d.expect(dashboard.classicHome).toBeVisible();
    expect(await conversations.listAll()).toHaveLength(1);
  });
});
