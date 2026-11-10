/**
 * The home with no connection: it says the assistant needs one, instead of
 * claiming it isn't set up or failing a send. "Offline" is React Query's
 * online state — the VM has no network to cut.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../e2e/pages/ChatPage';
import { DashboardPage } from '../e2e/pages/DashboardPage';
import { CHAT_MARKERS } from '../e2e/config/ai-scripts';
import { e2eClient } from '../e2e/utils/aepbase-helpers';

describe('Agentic home, offline', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
  });

  afterEach(async () => {
    onlineManager.setOnline(true);
    await h.close();
  });

  test('a new conversation says the assistant needs a connection, and waits', async () => {
    await h.loginAs(h.member);
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    await d.expect(dashboard.agenticHome).toBeVisible();
    await d.expect(chat.suggestions).toBeVisible();
    await chat.input.fill('Half a thought');

    onlineManager.setOnline(false);
    await d.expect(chat.messages).toContainText('the assistant needs a connection');
    await d.expect(chat.input).toBeDisabled();
    await d.expect(chat.sendButton).toBeDisabled();
    await d.expect(chat.suggestions).toHaveCount(0);
    // Still the assistant's home: no "isn't set up" note.
    await d.expect(dashboard.assistantUnavailable).toHaveCount(0);

    onlineManager.setOnline(true);
    await d.expect(chat.input).toBeEnabled();
    // What was typed before the connection dropped is still there to send.
    await d.expect(chat.input).toHaveValue('Half a thought');
    await d.expect(chat.suggestions).toBeVisible();
  });

  test('an open conversation stays readable, with the composer waiting', async () => {
    const { token } = await h.loginAs(h.member);
    const d = h.driver;
    const dashboard = new DashboardPage(d);
    const chat = new ChatPage(d);
    await d.expect(dashboard.agenticHome).toBeVisible();
    await chat.send(`Hi there ${CHAT_MARKERS.hello}`);
    await d.expect(chat.assistantMessages).toHaveCount(1);
    // The turn is stored before the connection goes.
    const conversations = e2eClient(token).collection<{ status?: string }>('conversations');
    await expect.poll(async () => (await conversations.listAll())[0]?.status).toBe('idle');
    await d.expect(chat.input).toBeEnabled();

    onlineManager.setOnline(false);
    await d.expect(chat.offlineNote).toBeVisible();
    await d.expect(chat.input).toBeDisabled();
    await d.expect(chat.userMessages).toHaveCount(1);
    await d.expect(chat.assistantMessages).toHaveCount(1);
    await d.expectURL(/\/dashboard\/c\//);

    onlineManager.setOnline(true);
    await d.expect(chat.offlineNote).toHaveCount(0);
    await d.expect(chat.input).toBeEnabled();
  });
});
