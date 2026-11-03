/**
 * Todo cards in an assistant reply: a todo the assistant adds, reads or lists
 * shows as the todo itself — live, with its checkbox — rather than as a
 * description of the call. The scripts (tests/e2e/config/ai-scripts.ts) run
 * their calls for real.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../../../../tests/e2e/pages/ChatPage';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { CHAT_MARKERS, TODO_ID } from '../../../../tests/e2e/config/ai-scripts';
import { TodoCards } from '../e2e/TodoCards';
import { createTodo, listTodos, type TodoRecord } from '../e2e/helpers';

describe('Todo cards in chat', () => {
  let h: Harness;
  let token: string;
  const todo = (id: string, as = token) => e2eClient(as).collection<TodoRecord>('todos').record(id);

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test('a todo the assistant adds shows as the todo, and its checkbox checks it off', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    const cards = new TodoCards(d);
    await chat.goto();
    await chat.send(`Remind us to water the plants ${CHAT_MARKERS.addTodo}`);

    await d.expect(chat.messages).toContainText('Added it.');
    await d.expect(chat.cardHeadlines.first()).toHaveText('Added todo');
    await d.expect(cards.card('Water the plants')).toHaveAttribute('data-status', 'pending');
    await chat.expectSettled(/water the plants/);

    await cards.toggleDone('Water the plants');
    await d.expect(cards.card('Water the plants')).toHaveAttribute('data-status', 'completed');
    const [saved] = await listTodos(token);
    expect(saved).toMatchObject({ title: 'Water the plants', status: 'completed' });
  });

  test('Do later on the card moves the todo, here and in the data', async () => {
    const d = h.driver;
    await e2eClient(token).collection('todos').create({ title: 'Call the plumber', status: 'pending' }, { id: TODO_ID });
    const chat = new ChatPage(d);
    const cards = new TodoCards(d);
    await chat.goto();
    await chat.send(`What's the plumber todo? ${CHAT_MARKERS.readTodo}`);

    await d.expect(chat.messages).toContainText('Here it is.');
    await cards.toggleLater('Call the plumber');
    await d.expect(cards.laterBadge('Call the plumber')).toBeVisible();
    expect((await todo(TODO_ID).get()).status).toBe('do_later');
  });

  test('the card follows what someone else does to the todo, through to deleting it', async () => {
    const d = h.driver;
    await e2eClient(token).collection('todos').create({ title: 'Call the plumber', status: 'pending' }, { id: TODO_ID });
    const chat = new ChatPage(d);
    const cards = new TodoCards(d);
    await chat.goto();
    await chat.send(`What's the plumber todo? ${CHAT_MARKERS.readTodo}`);
    await d.expect(chat.messages).toContainText('Here it is.');
    await d.expect(cards.card('Call the plumber')).toHaveAttribute('data-status', 'pending');

    // Sam moves it to later on another device: the card shows it, no reload.
    await todo(TODO_ID, h.householdMember.token).update({ status: 'do_later' });
    await d.expect(cards.laterBadge('Call the plumber')).toBeVisible();

    // …and then removes it.
    await todo(TODO_ID, h.householdMember.token).delete();
    await d.expect(cards.removedNote('Call the plumber')).toBeVisible();
    await d.expect(cards.card('Call the plumber').getByTestId('todo-card-check')).toHaveCount(0);
  });

  test('a list shows the todos, open ones first, each with its checkbox', async () => {
    const d = h.driver;
    await createTodo(token, { title: 'Done already', status: 'completed' });
    await createTodo(token, { title: 'Someday', status: 'do_later' });
    const open = await createTodo(token, { title: 'Take out the bins' });
    const chat = new ChatPage(d);
    const cards = new TodoCards(d);
    await chat.goto();
    await chat.send(`What's on the family list? ${CHAT_MARKERS.listTodos}`);

    await d.expect(chat.messages).toContainText('Here are your todos.');
    await d.expect(chat.cardHeadlines.first()).toHaveText('3 todos');
    await d.expect(cards.list).toBeVisible();
    await d.expect(cards.titles).toHaveCount(3);
    await d.expect(cards.titles.nth(0)).toHaveText('Take out the bins');
    await d.expect(cards.titles.nth(1)).toHaveText('Someday');
    await d.expect(cards.titles.nth(2)).toHaveText('Done already');

    await cards.toggleDone('Take out the bins');
    await d.expect(cards.card('Take out the bins')).toHaveAttribute('data-status', 'completed');
    expect((await todo(open.id).get()).status).toBe('completed');
  });
});
