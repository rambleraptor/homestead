/**
 * Notifications Page Object Model: the inbox and the "New message" dialog.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * and the in-process VM tier.
 */

import type { Driver } from '../../../packages/homestead-test-harness/driver/Driver';

export class NotificationsPage {
  constructor(readonly driver: Driver) {}

  async goto() {
    await this.driver.goto('/notifications');
    await this.driver.getByTestId('notifications-tabs').waitFor({ state: 'visible' });
  }

  /** Open "New message", pick a recipient by name, write it, and send. */
  async sendMessage({ to, title, body }: { to: string; title: string; body?: string }) {
    await this.driver.getByTestId('new-message-button').click();
    await this.driver.getByTestId('send-message-to').selectOption({ label: to });
    await this.driver.getByTestId('send-message-title').fill(title);
    if (body) await this.driver.getByTestId('send-message-body').fill(body);
    await this.driver.getByTestId('send-message-submit').click();
    await this.driver.getByTestId('send-message-form').waitFor({ state: 'detached' });
  }

  /** The "From …" line on an inbox row. */
  sender(notificationId: string) {
    return this.driver.getByTestId(`notification-from-${notificationId}`);
  }
}
