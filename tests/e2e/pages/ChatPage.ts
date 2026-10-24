/**
 * Chat Page Object Model.
 *
 * The built-in assistant at `/chat` (a new conversation) and `/chat/<id>` (a
 * stored one). With the AI provider pointed at the stub
 * (tests/e2e/config/ai-stub.ts), a message carrying a script marker from
 * `config/ai-scripts.ts` gets a scripted turn: tool calls that really run
 * against the server, then a scripted reply, streamed.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class ChatPage {
  constructor(readonly driver: Driver) {}

  async goto(conversationId?: string) {
    await this.driver.goto(conversationId ? `/chat/${conversationId}` : '/chat');
  }

  get input(): Locator {
    return this.driver.getByTestId('chat-input');
  }

  /** The composer's button: send when idle, stop while a turn runs. */
  get sendButton(): Locator {
    return this.driver.getByTestId('chat-send');
  }

  /** Type a message and send it. Resolves once it is submitted, not answered. */
  async send(text: string) {
    await this.input.fill(text);
    await this.sendButton.click();
  }

  /** Stop the running turn. */
  async stop() {
    await this.driver.getByRole('button', { name: 'Stop' }).click();
  }

  /** The transcript. */
  get messages(): Locator {
    return this.driver.getByTestId('chat-messages');
  }

  get userMessages(): Locator {
    return this.driver.getByTestId('chat-message-user');
  }

  get assistantMessages(): Locator {
    return this.driver.getByTestId('chat-message-assistant');
  }

  /** Every tool card in the transcript, oldest first. */
  get toolCalls(): Locator {
    return this.driver.getByTestId('chat-tool-call');
  }

  /** The "assistant is working" row, present until the reply starts. */
  get pending(): Locator {
    return this.driver.getByTestId('chat-pending');
  }

  /** The note on a turn that was stopped. */
  get stoppedNote(): Locator {
    return this.driver.getByTestId('chat-message-stopped');
  }

  /** A starter prompt on the empty conversation. */
  suggestion(text: string): Locator {
    return this.driver.getByTestId('chat-suggestions').getByRole('button', { name: text });
  }

  /** The conversation list. */
  get conversations(): Locator {
    return this.driver.getByTestId('chat-conversation');
  }

  conversation(title: string | RegExp): Locator {
    return this.conversations.filter({ hasText: title });
  }

  /**
   * Wait until no turn is running in the conversation: the server has
   * recorded how it ended, not just finished streaming it.
   */
  async expectSettled(title: string | RegExp) {
    await this.driver.expect(this.conversation(title)).toHaveAttribute('data-status', 'idle');
  }

  async newChat() {
    await this.driver.getByTestId('chat-new').click();
  }

  /** Delete a conversation from the list, confirming the prompt. */
  async deleteConversation(title: string | RegExp) {
    await this.conversation(title).getByTestId('chat-conversation-delete').click();
    await this.driver.getByRole('button', { name: 'Delete', exact: true }).click();
  }
}
