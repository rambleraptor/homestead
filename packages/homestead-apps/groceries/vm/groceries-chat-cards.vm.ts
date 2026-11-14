/**
 * Grocery cards in an assistant reply: an item the assistant adds shows as
 * the item, with its checkbox; several added in a row show as one card; a
 * list it reads comes back as the list to shop
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

  test('several adds in a row show as one card, with every item to check off', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    const cards = new GroceryCards(d);
    await chat.goto();
    await chat.send(`Add eggs, bread and butter ${CHAT_MARKERS.addGroceries}`);

    await d.expect(chat.messages).toContainText('Added all three.');
    await d.expect(chat.addBatch).toHaveCount(1);
    await d.expect(chat.cardHeadlines.first()).toHaveText('Added 3 groceries');
    // One card, not three: each add's own card is behind Details.
    await d.expect(chat.toolCalls).toHaveCount(0);
    await d.expect(cards.all).toHaveCount(3);
    await chat.expectSettled(/Add eggs/);

    await cards.toggle('Bread');
    await d.expect(cards.card('Bread')).toHaveAttribute('data-checked', 'true');
    expect((await groceries().listAll()).map((g) => [g.name, g.checked]).sort()).toEqual([
      ['Bread', true],
      ['Butter', false],
      ['Eggs', false],
    ]);

    await chat.openAddBatch();
    await d.expect(chat.toolCalls).toHaveCount(3);
  });

  test('an add that fails is named under the ones that went in', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    const cards = new GroceryCards(d);
    await chat.goto();
    await chat.send(`Add a few things ${CHAT_MARKERS.addGroceriesOneFails}`);

    await d.expect(chat.messages).toContainText('Added two; one would not go in.');
    await d.expect(chat.addBatch).toHaveCount(1);
    await d.expect(chat.cardHeadlines.first()).toHaveText('Added 2 groceries');
    await d.expect(cards.all).toHaveCount(2);
    await d.expect(chat.addBatchFailures).toContainText('One couldn’t be added');
    await d.expect(chat.addBatchFailures).toContainText('name');
    await chat.expectSettled(/Add a few things/);
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
