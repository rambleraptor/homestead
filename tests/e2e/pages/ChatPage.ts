/**
 * Chat Page Object Model.
 *
 * The assistant, on the home: `/dashboard` (a new conversation) and
 * `/dashboard/c/<id>` (a stored one), with past conversations in the home's
 * history drawer. With the AI provider pointed at the stub
 * (tests/e2e/config/ai-stub.ts), a message carrying a script marker from
 * `config/ai-scripts.ts` gets a scripted turn: tool calls that really run
 * against the server, then a scripted reply, streamed.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, FilePayload, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class ChatPage {
  constructor(readonly driver: Driver) {}

  async goto(conversationId?: string) {
    await this.driver.goto(conversationId ? `/dashboard/c/${conversationId}` : '/dashboard');
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

  /** Attach files to the message being written, as the file picker would. */
  async attach(files: FilePayload | FilePayload[]) {
    await this.driver.getByLabel('Upload files').setInputFiles(files);
  }

  /** The files waiting in the composer. */
  get composerAttachments(): Locator {
    return this.driver.getByTestId('chat-composer-attachment');
  }

  /** Remove a waiting file from the composer. */
  async removeAttachment(name: string) {
    await this.driver.getByRole('button', { name: `Remove ${name}` }).click();
  }

  /** The files attached to messages in the transcript. */
  get attachments(): Locator {
    return this.driver.getByTestId('chat-attachment');
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

  /** The card a tool call waiting on the person shows. */
  get approvalCard(): Locator {
    return this.driver.getByTestId('chat-approval');
  }

  /** Answer the waiting tool call. */
  async answerApproval(approved: boolean) {
    await this.driver.getByTestId(approved ? 'chat-approval-approve' : 'chat-approval-deny').click();
    await this.approvalCard.waitFor({ state: 'detached' });
  }

  /** Every tool card in the transcript, oldest first. */
  get toolCalls(): Locator {
    return this.driver.getByTestId('chat-tool-call');
  }

  /** Open a tool card to show what it sent and got back. */
  async openToolCall(index = 0) {
    await this.toolCalls.nth(index).getByRole('button').first().click();
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

  /** The past-conversations drawer (open it with {@link openHistory}). */
  get historyDrawer(): Locator {
    return this.driver.getByTestId('agentic-history-drawer');
  }

  async openHistory() {
    await this.driver.getByTestId('agentic-history').click();
    await this.historyDrawer.waitFor({ state: 'visible' });
  }

  async closeHistory() {
    await this.historyDrawer.getByRole('button', { name: 'Close' }).click();
    await this.historyDrawer.waitFor({ state: 'detached' });
  }

  /** The conversations listed in the open drawer. */
  get conversations(): Locator {
    return this.historyDrawer.getByTestId('chat-conversation');
  }

  conversation(title: string | RegExp): Locator {
    return this.conversations.filter({ hasText: title });
  }

  /**
   * Wait until no turn is running in the conversation: the server has
   * recorded how it ended, not just finished streaming it. Looks in the
   * history drawer, and closes it again.
   */
  async expectSettled(title: string | RegExp) {
    await this.openHistory();
    await this.driver.expect(this.conversation(title)).toHaveAttribute('data-status', 'idle');
    await this.closeHistory();
  }

  /** Start over from an open conversation. */
  async newChat() {
    await this.driver.getByTestId('agentic-new-chat').click();
  }

  /** Delete a conversation from the drawer, confirming the prompt. */
  async deleteConversation(title: string | RegExp) {
    await this.openHistory();
    await this.conversation(title).getByTestId('chat-conversation-delete').click();
    await this.driver.getByRole('button', { name: 'Delete', exact: true }).click();
  }
}
