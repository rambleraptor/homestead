/**
 * Credential slots on the VM tier: Superuser → Credentials lists what
 * Homestead needs — here the AI key — with its environment variable and where
 * its value comes from, and setting it there turns the assistant on at once,
 * no restart. Only superusers see the slots, and never a value.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { CredentialsPage } from '../e2e/pages/CredentialsPage';
import { ChatPage } from '../e2e/pages/ChatPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';
import { CHAT_MARKERS } from '../e2e/config/ai-scripts';

const APP = () => process.env.HOMESTEAD_E2E_APP_URL!;
const KEY = 'sk-test-0123456789abcdef9f3e';

describe('Credential slots', () => {
  let h: Harness;
  const envKey = process.env.AI_API_KEY;

  beforeEach(async () => {
    h = await bootHomestead();
  });

  afterEach(async () => {
    await h.close();
    if (envKey === undefined) delete process.env.AI_API_KEY;
    else process.env.AI_API_KEY = envKey;
  });

  const slots = async (token: string) =>
    fetch(`${APP()}/api/credential-slots`, { headers: { Authorization: `Bearer ${token}` } });
  const aiConfigured = async () => ((await (await fetch(`${APP()}/api/chat`)).json()) as { configured: boolean }).configured;

  test('a missing AI key, set from Credentials, turns the assistant on at once', async () => {
    delete process.env.AI_API_KEY;
    expect(await aiConfigured()).toBe(false);

    await h.loginAs(h.admin);
    const page = new CredentialsPage(h.driver);
    await page.goto();
    await h.driver.expect(page.slot('ai-api-key')).toContainText('AI provider API key');
    await h.driver.expect(page.slot('ai-api-key')).toContainText('AI_API_KEY');
    await h.driver.expect(page.slotStatus('ai-api-key')).toContainText('Missing');

    await page.setSlot('ai-api-key', KEY);
    await h.driver.expect(page.slotStatus('ai-api-key')).toContainText('Set here · …9f3e');
    expect(await aiConfigured()).toBe(true);

    // Stored as the credential named by the slot's id, never shown back.
    const stored = await e2eClient(h.admin.token).collection('credentials').get('ai-api-key');
    expect(stored).toMatchObject({ name: 'AI provider API key', value: { $secret: true, set: true } });
    const body = await (await slots(h.admin.token)).text();
    expect(body).not.toContain(KEY);
    expect(JSON.parse(body).slots[0]).toMatchObject({ id: 'ai-api-key', source: 'stored', env: 'AI_API_KEY' });

    // …and the assistant answers.
    const chat = new ChatPage(h.driver);
    await chat.goto();
    await chat.send(`Hi ${CHAT_MARKERS.hello}`);
    await h.driver.expect(chat.messages).toContainText('Hello from the scripted assistant');
  });

  test('clearing it turns the assistant off again', async () => {
    delete process.env.AI_API_KEY;
    await e2eClient(h.admin.token)
      .collection('credentials')
      .create({ name: 'AI provider API key', value: KEY }, { id: 'ai-api-key' });
    expect(await aiConfigured()).toBe(true);

    await h.loginAs(h.admin);
    const page = new CredentialsPage(h.driver);
    await page.goto();
    await page.clearSlot('ai-api-key');
    await h.driver.expect(page.slotStatus('ai-api-key')).toContainText('Missing');
    expect(await aiConfigured()).toBe(false);
  });

  test('the environment variable wins, and the slot says so', async () => {
    process.env.AI_API_KEY = 'from-the-environment';
    await h.loginAs(h.admin);
    const page = new CredentialsPage(h.driver);
    await page.goto();
    await h.driver.expect(page.slotStatus('ai-api-key')).toContainText('From the environment variable AI_API_KEY');
    await h.driver.expect(page.setSlotButton('ai-api-key')).toBeHidden();
    expect(await (await slots(h.admin.token)).text()).not.toContain('from-the-environment');
  });

  test('only superusers can see what Homestead needs', async () => {
    expect((await slots(h.member.token)).status).toBe(403);
    expect((await fetch(`${APP()}/api/credential-slots`)).status).toBe(401);
  });
});
