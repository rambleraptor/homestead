/**
 * Minigolf Page Object Model
 *
 * Covers the four views of the minigolf app: list, setup, play, results.
 * Written against the shared `Driver`, so it runs on the VM tier (`../vm/`)
 * and, via `playwrightDriver(page)`, in Playwright.
 */

import type { Driver, Locator } from '../../../../homestead-test-harness/driver/Driver';

export class MinigolfPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/games/minigolf');
  }

  async expectToBeOnMinigolfPage() {
    await this.driver.expectURL(/\/games\/minigolf/);
    await this.expect(this.driver.getByRole('heading', { name: 'Mini Golf' })).toBeVisible();
  }

  async clickNewGame() {
    const btn = this.driver.getByTestId('new-game-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async selectPlayerById(personId: string) {
    const toggle = this.driver.getByTestId(`player-toggle-${personId}`);
    await toggle.waitFor({ state: 'visible' });
    await toggle.click();
  }

  async setHoleCount(target: number) {
    // The stepper renders the number in a span; bump up or down until it
    // matches. Default hole count is 9.
    const valueLocator = this.driver.getByTestId('hole-count-value');
    await valueLocator.waitFor({ state: 'visible' });
    let current = Number((await valueLocator.textContent())?.trim() || '0');
    while (current < target) {
      await this.driver.getByTestId('hole-count-inc').click();
      current += 1;
    }
    while (current > target) {
      await this.driver.getByTestId('hole-count-dec').click();
      current -= 1;
    }
  }

  async startGame() {
    const btn = this.driver.getByTestId('start-game-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    // Wait for the play view to render.
    await this.driver.getByTestId('hole-title').waitFor({ state: 'visible' });
  }

  async expectOnHole(hole: number, total: number) {
    await this.expect(this.driver.getByTestId('hole-title')).toHaveText(
      `Hole ${hole} of ${total}`,
    );
  }

  async setPar(target: number) {
    const valueLocator = this.driver.getByTestId('par-value');
    await valueLocator.waitFor({ state: 'visible' });
    let current = Number((await valueLocator.textContent())?.trim() || '0');
    while (current < target) {
      await this.driver.getByTestId('par-inc').click();
      current += 1;
    }
    while (current > target) {
      await this.driver.getByTestId('par-dec').click();
      current -= 1;
    }
  }

  async setStrokesFor(personId: string, target: number) {
    const valueLocator = this.driver.getByTestId(`strokes-${personId}-value`);
    await valueLocator.waitFor({ state: 'visible' });
    let current = Number((await valueLocator.textContent())?.trim() || '0');
    while (current < target) {
      await this.driver.getByTestId(`strokes-${personId}-inc`).click();
      current += 1;
    }
    while (current > target) {
      await this.driver.getByTestId(`strokes-${personId}-dec`).click();
      current -= 1;
    }
  }

  async tapNext() {
    const btn = this.driver.getByTestId('hole-next');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async tapFinish() {
    const btn = this.driver.getByTestId('hole-finish');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    // Results view replaces play view once the mutation settles.
    await this.driver.getByTestId('game-winner').waitFor({ state: 'visible' });
  }

  async expectWinner(name: string) {
    await this.expect(this.driver.getByTestId('game-winner')).toContainText(name);
  }

  async expectTotalFor(personId: string, total: number) {
    await this.expect(this.driver.getByTestId(`total-${personId}`)).toContainText(
      String(total),
    );
  }

  async backToList() {
    await this.driver.getByTestId('results-back').click();
    await this.driver.getByTestId('new-game-button').waitFor({ state: 'visible' });
  }

  async expectGameInList() {
    await this.driver.getByTestId('game-list').waitFor({ state: 'visible' });
  }
}
