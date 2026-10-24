/**
 * Chat Page Object Model.
 *
 * The built-in assistant at `/chat`. With the AI provider pointed at the stub
 * (tests/e2e/config/ai-stub.ts), a message carrying a script marker from
 * `config/ai-scripts.ts` gets a scripted turn: tool calls that really run
 * against the server, then a scripted reply.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class ChatPage {
  constructor(readonly driver: Driver) {}

  async goto() {
    await this.driver.goto('/chat');
  }

  get input(): Locator {
    return this.driver.getByTestId('chat-input');
  }

  /** Type a message and send it. Resolves once it is submitted, not answered. */
  async send(text: string) {
    await this.input.fill(text);
    await this.driver.getByTestId('chat-send').click();
  }

  /** The transcript. */
  get messages(): Locator {
    return this.driver.getByTestId('chat-messages');
  }

  /** Every tool-call marker in the transcript, oldest first. */
  get toolCalls(): Locator {
    return this.driver.getByTestId('chat-tool-call');
  }

  /** The "assistant is typing" indicator, present while a turn is in flight. */
  get pending(): Locator {
    return this.driver.getByTestId('chat-pending');
  }
}
