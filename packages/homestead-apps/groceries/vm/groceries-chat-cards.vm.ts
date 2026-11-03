/**
 * Grocery cards in an assistant reply: an item the assistant adds shows as
 * the item, with its checkbox; a list it reads comes back as the list to shop
 * from, grouped by store, with a way to share it with the household. The
 * scripts (tests/e2e/config/ai-scripts.ts) run their calls for real.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../../../../tests/e2e/pages/ChatPage';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { CHAT_MARKERS } from '../../../../tests/e2e/config/ai-scripts';
import { GroceryCards } from '../e2e/GroceryCards';
import { SHARE_LIST_TEXT } from '../components/cards/GroceryListCard';

interface GroceryRecord {
  id: string;
  name: string;
  checked: boolean;
}

describe('Grocery cards in chat', () => {
  let h: Harness;
  let token: string;
  const groceries = () => e2eClient(token).collection<GroceryRecord>('groceries');
  const stores = () => e2eClient(token).collection<{ id: string }>('stores');

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test('an item the assistant adds shows as the item, and its checkbox checks it off', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    const cards = new GroceryCards(d);
    await chat.goto();
    await chat.send(`Add milk to the grocery list ${CHAT_MARKERS.addMilk}`);

    await d.expect(chat.messages).toContainText('Added milk to the grocery list.');
    await d.expect(cards.card('Milk')).toHaveAttribute('data-checked', 'false');
    await chat.expectSettled(/Add milk/);

    await cards.toggle('Milk');
    await d.expect(cards.card('Milk')).toHaveAttribute('data-checked', 'true');
    expect((await groceries().listAll()).map((g) => [g.name, g.checked])).toEqual([['Milk', true]]);
  });

  test('a list comes back grouped by store, in the household’s store order', async () => {
    const d = h.driver;
    const costco = await stores().create({ name: 'Costco', sort_order: 0 });
    const tj = await stores().create({ name: "Trader Joe's", sort_order: 1 });
    await groceries().create({ name: 'Eggs', checked: false, store: tj.id });
    await groceries().create({ name: 'Rice', checked: false, store: costco.id });
    await groceries().create({ name: 'Bread', checked: false });
    await groceries().create({ name: 'Chips', checked: true });

    const chat = new ChatPage(d);
    const cards = new GroceryCards(d);
    await chat.goto();
    await chat.send(`What do we need? ${CHAT_MARKERS.listUnchecked}`);

    await d.expect(chat.messages).toContainText('Here is what is still on the list.');
    await d.expect(chat.cardHeadlines.first()).toHaveText('3 groceries');
    await d.expect(cards.groups).toHaveCount(3);
    await d.expect(cards.groups.nth(0)).toHaveAttribute('data-store', 'Costco');
    await d.expect(cards.groups.nth(1)).toHaveAttribute('data-store', "Trader Joe's");
    await d.expect(cards.groups.nth(2)).toHaveAttribute('data-store', 'No store');
    await d.expect(cards.groups.nth(0)).toContainText('Rice');
    await d.expect(cards.groups.nth(1)).toContainText('Eggs');
    await d.expect(cards.list).not.toContainText('Chips');

    await cards.toggle('Eggs');
    await d.expect(cards.card('Eggs')).toHaveAttribute('data-checked', 'true');
    const eggs = (await groceries().listAll()).find((g) => g.name === 'Eggs');
    expect(eggs?.checked).toBe(true);
  });

  test('sharing the list carries the conversation on', async () => {
    const d = h.driver;
    await groceries().create({ name: 'Eggs', checked: false });
    const chat = new ChatPage(d);
    const cards = new GroceryCards(d);
    await chat.goto();
    await chat.send(`What do we need? ${CHAT_MARKERS.listUnchecked}`);
    await d.expect(chat.messages).toContainText('Here is what is still on the list.');
    await chat.expectSettled(/What do we need/);

    await cards.shareButton.click();
    await d.expect(chat.userMessages).toHaveCount(2);
    await d.expect(chat.userMessages.nth(1)).toHaveText(SHARE_LIST_TEXT);
    await d.expect(chat.assistantMessages).toHaveCount(2);
    await chat.expectSettled(/What do we need/);
  });
});
