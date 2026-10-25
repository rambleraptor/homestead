/**
 * Dashboard Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, FilePayload, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class DashboardPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/dashboard');
  }

  async expectToBeOnDashboard() {
    await this.driver.expectURL(/\/dashboard/);
  }

  async expectWelcomeMessage() {
    await this.expect(
      this.driver.getByText(/welcome/i).or(this.driver.getByRole('heading', { level: 1 })),
    ).toBeVisible();
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

  get welcomePanel() {
    return this.driver.getByTestId('welcome-panel');
  }

  get adminChecklist() {
    return this.driver.getByTestId('admin-checklist');
  }

  /** The assistant-first home (behind the `dashboard.agentic_home` flag). */
  get agenticHome() {
    return this.driver.getByTestId('agentic-home');
  }

  get briefing() {
    return this.driver.getByTestId('agentic-briefing');
  }

  get carousel() {
    return this.driver.getByTestId('agentic-carousel');
  }

  /** One card on the carousel, by widget id. */
  carouselCard(widgetId: string) {
    return this.driver.getByTestId(`agentic-card-${widgetId}`);
  }

  /** The link from the home's conversation to the Chat screen. */
  get openInChat() {
    return this.driver.getByTestId('agentic-open-chat');
  }

  /** The "Ask Homestead" box that opens a new chat. */
  get askBox() {
    return this.driver.getByTestId('ask-widget');
  }

  /** The suggestion chips under the ask box. */
  get askSuggestions() {
    return this.driver.getByTestId('ask-suggestions').getByRole('button');
  }

  /** Type into the ask box and send. Resolves once it's submitted. */
  async ask(text: string) {
    await this.driver.getByTestId('ask-input').fill(text);
    await this.driver.getByTestId('ask-send').click();
  }

  /** Attach files to the ask box, as its file picker would. */
  async attachToAsk(files: FilePayload | FilePayload[]) {
    await this.askBox.getByLabel('Upload files').setInputFiles(files);
  }

  async dismissWelcome() {
    const dismiss = this.driver.getByTestId('welcome-dismiss');
    await dismiss.waitFor({ state: 'visible' });
    await dismiss.click();
    // The panel unmounts as soon as the setting write resolves.
    await this.welcomePanel.waitFor({ state: 'detached' });
  }
}
