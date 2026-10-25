/**
 * Dashboard Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`tests/vm/`).
 */

import type { Driver } from '../../../packages/homestead-test-harness/driver/Driver';

export class DashboardPage {
  constructor(readonly driver: Driver) {}

  async goto() {
    await this.driver.goto('/dashboard');
  }

  async expectToBeOnDashboard() {
    await this.driver.expectURL(/\/dashboard/);
  }

  async logout() {
    // Use data-testid for reliable selection (preferred method)
    const logoutButton = this.driver.getByTestId('logout-button');
    // Wait for the button to be attached + visible before clicking. The
    // sidebar mounts as soon as the shell renders, but giving this an
    // explicit auto-wait makes the failure mode more legible if it
    // regresses.
    await logoutButton.waitFor({ state: 'visible' });
    await logoutButton.scrollIntoViewIfNeeded();
    await logoutButton.click();
    // Wait for logout to redirect to the login page. The redirect is
    // driven by the AuthGuard's useEffect after auth state clears, so we
    // give it a generous budget in case dev-mode rebuilds are in flight.
    await this.driver.waitForURL(/\/login/, { timeout: 15000 });
  }

  async navigateToApp(appName: string | RegExp) {
    await this.driver.getByRole('navigation').getByRole('link', { name: appName }).click();
  }

  get adminChecklist() {
    return this.driver.getByTestId('admin-checklist');
  }

  /** The home: the assistant's conversation under the strip of widget chips. */
  get agenticHome() {
    return this.driver.getByTestId('agentic-home');
  }

  /** In place of the conversation when the assistant can't serve this person; `data-reason` says why. */
  get assistantUnavailable() {
    return this.driver.getByTestId('home-assistant-unavailable');
  }

  /** The strip of widget chips along the top of the home. */
  get strip() {
    return this.driver.getByTestId('agentic-strip');
  }

  /** One chip on the strip, by widget id. Tapping it opens the widget. */
  widgetChip(widgetId: string) {
    return this.driver.getByTestId(`agentic-chip-${widgetId}`);
  }

  /** The widget opened from its chip, under the strip. */
  get widgetPanel() {
    return this.driver.getByTestId('agentic-widget-panel');
  }

  /** "New chat" on the home, once a conversation is open. */
  get newChat() {
    return this.driver.getByTestId('agentic-new-chat');
  }

  /** The button that opens the past-conversations drawer. */
  get historyButton() {
    return this.driver.getByTestId('agentic-history');
  }

  get historyDrawer() {
    return this.driver.getByTestId('agentic-history-drawer');
  }

  /** A past conversation in the drawer, by its title. */
  historyConversation(title: string | RegExp) {
    return this.historyDrawer.getByTestId('chat-conversation').filter({ hasText: title });
  }

  /** Open the drawer and pick a past conversation. */
  async openPastConversation(title: string | RegExp) {
    await this.historyButton.click();
    await this.historyConversation(title).getByRole('link').click();
  }
}
