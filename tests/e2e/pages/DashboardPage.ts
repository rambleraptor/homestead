/**
 * Dashboard Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

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

  /** The classic dashboard (the `dashboard.classic_home` flag's audience). */
  get classicHome() {
    return this.driver.getByTestId('classic-home');
  }

  /** A member's getting-started guide on the classic dashboard. */
  get welcomePanel() {
    return this.driver.getByTestId('welcome-panel');
  }

  async dismissWelcome() {
    const dismiss = this.driver.getByTestId('welcome-dismiss');
    await dismiss.waitFor({ state: 'visible' });
    await dismiss.click();
    // The panel unmounts as soon as the setting write resolves.
    await this.welcomePanel.waitFor({ state: 'detached' });
  }

  /** The classic dashboard's "Ask Homestead" box, which starts a conversation. */
  get askBox() {
    return this.driver.getByTestId('ask-widget');
  }

  /** The suggestion chips under the ask box. */
  get askSuggestions(): Locator {
    return this.driver.getByTestId('ask-suggestions').getByRole('button');
  }

  /** Type into the ask box and send. */
  async ask(text: string) {
    await this.driver.getByTestId('ask-input').fill(text);
    await this.driver.getByTestId('ask-send').click();
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
