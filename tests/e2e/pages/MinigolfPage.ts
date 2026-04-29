/**
 * Minigolf Page Object Model
 *
 * Covers the four views of the minigolf module: list, setup, play, results.
 */

import { Page, expect } from '@playwright/test';

export class MinigolfPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/games/minigolf');
  }

  async expectToBeOnMinigolfPage() {
    await expect(this.page).toHaveURL(/\/games\/minigolf/);
    await expect(this.page.getByRole('heading', { name: 'Mini Golf' })).toBeVisible();
  }

  async clickNewGame() {
    const btn = this.page.getByTestId('new-game-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async selectPlayerById(personId: string) {
    const toggle = this.page.getByTestId(`player-toggle-${personId}`);
    await toggle.waitFor({ state: 'visible' });
    await toggle.click();
  }

  async setHoleCount(target: number) {
    // The stepper renders the number in a span; bump up or down until it
    // matches. Default hole count is 9.
    const valueLocator = this.page.getByTestId('hole-count-value');
    await valueLocator.waitFor({ state: 'visible' });
    let current = Number((await valueLocator.textContent())?.trim() || '0');
    while (current < target) {
      await this.page.getByTestId('hole-count-inc').click();
      current += 1;
    }
    while (current > target) {
      await this.page.getByTestId('hole-count-dec').click();
      current -= 1;
    }
  }

  async startGame() {
    const btn = this.page.getByTestId('start-game-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    // Wait for the play view to render.
    await this.page.getByTestId('hole-title').waitFor({ state: 'visible' });
  }

  async expectOnHole(hole: number, total: number) {
    await expect(this.page.getByTestId('hole-title')).toHaveText(
      `Hole ${hole} of ${total}`,
    );
  }

  async setPar(target: number) {
    const valueLocator = this.page.getByTestId('par-value');
    await valueLocator.waitFor({ state: 'visible' });
    let current = Number((await valueLocator.textContent())?.trim() || '0');
    while (current < target) {
      await this.page.getByTestId('par-inc').click();
      current += 1;
    }
    while (current > target) {
      await this.page.getByTestId('par-dec').click();
      current -= 1;
    }
  }

  async setStrokesFor(personId: string, target: number) {
    const valueLocator = this.page.getByTestId(`strokes-${personId}-value`);
    await valueLocator.waitFor({ state: 'visible' });
    let current = Number((await valueLocator.textContent())?.trim() || '0');
    while (current < target) {
      await this.page.getByTestId(`strokes-${personId}-inc`).click();
      current += 1;
    }
    while (current > target) {
      await this.page.getByTestId(`strokes-${personId}-dec`).click();
      current -= 1;
    }
  }

  async tapNext() {
    const btn = this.page.getByTestId('hole-next');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async tapFinish() {
    const btn = this.page.getByTestId('hole-finish');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    // Results view replaces play view once the mutation settles.
    await this.page.getByTestId('game-winner').waitFor({ state: 'visible' });
  }

  async expectWinner(name: string) {
    await expect(this.page.getByTestId('game-winner')).toContainText(name);
  }

  async expectTotalFor(personId: string, total: number) {
    await expect(this.page.getByTestId(`total-${personId}`)).toContainText(
      String(total),
    );
  }

  async backToList() {
    await this.page.getByTestId('results-back').click();
    await this.page.getByTestId('new-game-button').waitFor({ state: 'visible' });
  }

  async expectGameInList() {
    await this.page.getByTestId('game-list').waitFor({ state: 'visible' });
  }
}
