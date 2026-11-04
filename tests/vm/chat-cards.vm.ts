/**
 * Cards: a tool call on one of Homestead's resources renders in the reply as
 * what it did, in the person's terms — the record's title and readable fields
 * — with the raw parameters and result behind a Details toggle. The scripts
 * (tests/e2e/config/ai-scripts.ts) run their calls for real, so each spec
 * also checks the data the card describes.
 */

import { afterEach, beforeEach, describe, test, expect } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { ChatPage } from '../e2e/pages/ChatPage';
import { TodoCards } from '../../packages/homestead-apps/todos/e2e/TodoCards';
import { e2eClient } from '../e2e/utils/aepbase-helpers';
import { CHAT_MARKERS, TODO_ID } from '../e2e/config/ai-scripts';

interface TodoRecord {
  id: string;
  title: string;
  status: string;
}

describe('Chat cards', () => {
  let h: Harness;
  let token: string;
  const todos = () => e2eClient(token).collection<TodoRecord>('todos');
  const seedTodo = () => todos().create({ title: 'Call the plumber', status: 'pending' }, { id: TODO_ID });

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
  });

  afterEach(async () => {
    await h.close();
  });

  test('an update shows the record and the fields that changed', async () => {
    const d = h.driver;
    await seedTodo();
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Move the plumber to later ${CHAT_MARKERS.updateTodo}`);

    await d.expect(chat.messages).toContainText('Moved it to Do Later.');
    const card = chat.card('todo');
    await d.expect(card).toHaveAttribute('data-action', 'update');
    await d.expect(card).toHaveAttribute('data-mode', 'done');
    await d.expect(chat.cardHeadlines.first()).toHaveText('Changed todo');
    // The todo as the Todos app draws it, now, under what the call changed —
    // the enum value as words, labeled by field.
    await d.expect(new TodoCards(d).titles.first()).toHaveText('Call the plumber');
    await d.expect(card).toContainText('Changed');
    await d.expect(card).toContainText('Status');
    await d.expect(card).toContainText('Do later');
    await d.expect(card).not.toContainText('do_later');
    expect((await todos().get(TODO_ID)).status).toBe('do_later');

    // The JSON is still there, behind Details.
    await d.expect(chat.toolCalls.first()).not.toContainText('Parameters');
    await chat.openToolCall();
    await d.expect(chat.toolCalls.first()).toContainText('Parameters');
    await d.expect(chat.toolCalls.first()).toContainText('"status": "do_later"');
    await d.expect(chat.toolCalls.first()).toContainText('Result');
  });

  test('a delete strikes the record through', async () => {
    const d = h.driver;
    await seedTodo();
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Remove the plumber todo ${CHAT_MARKERS.deleteTodo}`);

    await d.expect(chat.messages).toContainText('Removed it.');
    await d.expect(chat.card('todo')).toHaveAttribute('data-mode', 'done');
    await d.expect(chat.cardHeadlines.first()).toHaveText('Removed todo');
    await d.expect(chat.toolCalls.first()).toContainText('Completed');
    expect(await todos().listAll()).toEqual([]);
  });

  test('a read shows the record', async () => {
    const d = h.driver;
    await seedTodo();
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`What's the plumber todo? ${CHAT_MARKERS.readTodo}`);

    await d.expect(chat.messages).toContainText('Here it is.');
    await d.expect(chat.cardHeadlines.first()).toHaveText('Looked up todo');
    const todos = new TodoCards(d);
    await d.expect(todos.titles.first()).toHaveText('Call the plumber');
    await d.expect(todos.card('Call the plumber')).toHaveAttribute('data-status', 'pending');
  });

  test('a call that fails says so on the card, and is badged as an error', async () => {
    const d = h.driver;
    // No seeded todo: the update has nothing to change.
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Move the plumber to later ${CHAT_MARKERS.updateTodo}`);

    await d.expect(chat.messages).toContainText('Moved it to Do Later.');
    const card = chat.card('todo');
    await d.expect(card).toHaveAttribute('data-mode', 'failed');
    await d.expect(chat.cardHeadlines.first()).toHaveText("Couldn't change todo");
    await d.expect(d.getByTestId('chat-card-error')).toBeVisible();
    await d.expect(chat.toolCalls.first()).toContainText('Error');
    await d.expect(chat.toolCalls.first()).not.toContainText('Completed');
  });

  test('a stored conversation renders its cards again from history', async () => {
    const d = h.driver;
    await seedTodo();
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Move the plumber to later ${CHAT_MARKERS.updateTodo}`);
    await d.expect(chat.cardHeadlines.first()).toHaveText('Changed todo');
    await chat.expectSettled(/plumber/);

    await d.reload();
    await d.expect(chat.cardHeadlines.first()).toHaveText('Changed todo');
    await d.expect(new TodoCards(d).titles.first()).toHaveText('Call the plumber');
    await d.expect(chat.card('todo')).toHaveAttribute('data-mode', 'done');
  });

  test('a proposed call shows its card before the person answers', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Tell Sam I'm running late ${CHAT_MARKERS.messageSam}`);

    await d.expect(chat.approvalCard).toBeVisible();
    const card = chat.approvalCard.getByTestId('chat-card-notification');
    await d.expect(card).toHaveAttribute('data-mode', 'proposed');
    // The message as it would land in Sam's inbox.
    await d.expect(chat.cardHeadlines.first()).toHaveText('Message for Sam');
    await d.expect(chat.cardRecipient).toHaveText('To Sam');
    await d.expect(chat.cardMessage).toContainText('Running late');
    await d.expect(chat.cardMessage).toContainText('Be there by 6:30');
    // The card names the recipient, so the approval doesn't repeat it.
    await d.expect(d.getByTestId('chat-approval-to')).toHaveCount(0);

    await chat.answerApproval(false);
    await d.expect(chat.card('notification')).toHaveAttribute('data-mode', 'denied');
    await d.expect(chat.cardHeadlines.first()).toHaveText('Not sent to Sam');
    await d.expect(chat.toolCalls.first()).toContainText('Denied');
  });

  test('an approved message reads as sent, with what was sent', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Tell Sam I'm running late ${CHAT_MARKERS.messageSam}`);
    await chat.answerApproval(true);

    await d.expect(chat.messages).toContainText('Done.');
    await d.expect(chat.card('notification')).toHaveAttribute('data-mode', 'done');
    await d.expect(chat.cardHeadlines.first()).toHaveText('Sent to Sam');
    await d.expect(chat.cardMessage).toContainText('Running late');
  });

  describe('undo', () => {
    test("an update can be put back, and then says it's undone", async () => {
      const d = h.driver;
      await seedTodo();
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.send(`Move the plumber to later ${CHAT_MARKERS.updateTodo}`);
      await d.expect(chat.messages).toContainText('Moved it to Do Later.');
      await chat.expectSettled(/plumber/);

      await chat.undoButton.click();
      await d.expect(chat.undoneNote).toHaveText('Undone');
      await d.expect(chat.undoButton).toHaveCount(0);
      expect((await todos().get(TODO_ID)).status).toBe('pending');

      // After a reload it still knows: the todo holds what it had before.
      await d.reload();
      await d.expect(chat.undoneNote).toHaveText('Undone');
    });

    test('an update someone has changed since is not offered for undo', async () => {
      const d = h.driver;
      await seedTodo();
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.send(`Move the plumber to later ${CHAT_MARKERS.updateTodo}`);
      await d.expect(chat.undoButton).toBeVisible();

      await e2eClient(h.householdMember.token).collection('todos').record(TODO_ID).update({ status: 'completed' });
      await d.expect(chat.undoButton).toHaveCount(0);
      await d.expect(chat.undoneNote).toHaveCount(0);
      await chat.expectSettled(/plumber/);
    });

    test('a delete can be put back under the same id', async () => {
      const d = h.driver;
      await seedTodo();
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.send(`Remove the plumber todo ${CHAT_MARKERS.deleteTodo}`);
      await d.expect(chat.messages).toContainText('Removed it.');
      await chat.expectSettled(/plumber/);

      await chat.undoButton.click();
      await d.expect(chat.undoneNote).toHaveText('Restored');
      expect(await todos().get(TODO_ID)).toMatchObject({ title: 'Call the plumber', status: 'pending' });
    });

    test('a call that failed has nothing to undo', async () => {
      const d = h.driver;
      const chat = new ChatPage(d);
      await chat.goto();
      await chat.send(`Move the plumber to later ${CHAT_MARKERS.updateTodo}`);
      await d.expect(chat.card('todo')).toHaveAttribute('data-mode', 'failed');
      await d.expect(chat.undoButton).toHaveCount(0);
      await chat.expectSettled(/plumber/);
    });
  });

  test('reads in a row fold into one line, with each one behind it', async () => {
    const d = h.driver;
    const chat = new ChatPage(d);
    await chat.goto();
    await chat.send(`Anything to do? ${CHAT_MARKERS.lookAround}`);

    await d.expect(chat.messages).toContainText('Nothing needs doing.');
    await d.expect(chat.readRollup).toHaveCount(1);
    await d.expect(chat.readRollup).toContainText('Looked at people and gift cards');
    await d.expect(chat.toolCalls).toHaveCount(0);

    await chat.openReadRollup();
    await d.expect(chat.toolCalls).toHaveCount(2);
    await d.expect(chat.card('person')).toBeVisible();
    await d.expect(chat.card('gift-card')).toBeVisible();
    await chat.expectSettled(/Anything to do/);
  });
});
