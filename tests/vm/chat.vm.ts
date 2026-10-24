/**
 * The chat assistant, end to end on the VM tier: a message goes to the real
 * `/api/chat` handler, the model (the AI stub, answering from a script in
 * tests/e2e/config/ai-scripts.ts) calls the real per-resource tools, and the
 * transcript shows what ran. What the tools change is checked in the data and
 * on the screen that shows it.
 */

import { afterEach, beforeEach, describe, test, expect } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../e2e/pages/ChatPage';
import { e2eClient } from '../e2e/utils/aepbase-helpers';
import { CHAT_MARKERS } from '../e2e/config/ai-scripts';

interface GroceryItemRecord {
  id: string;
  name: string;
  checked: boolean;
}

describe('Chat', () => {
  let h: Harness;
  let token: string;

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
    await d.expect(chat.toolCalls.first()).toContainText('groceries');
    await d.expect(chat.toolCalls.first()).toContainText('create');
    await d.expect(chat.pending).toHaveCount(0);

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
    await d.expect(chat.toolCalls.first()).toContainText('list');
    // A read leaves the data as it was.
    expect((await groceries.listAll()).map((i) => i.name).sort()).toEqual(['Bread', 'Eggs']);
  });

  test('a plain reply needs no tool at all', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Hi there ${CHAT_MARKERS.hello}`);

    await d.expect(chat.messages).toContainText('Hello from the scripted assistant. How can I help?');
    await d.expect(chat.toolCalls).toHaveCount(0);
  });
});
