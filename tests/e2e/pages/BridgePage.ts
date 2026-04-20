/**
 * Bridge Page Object Model
 *
 * The bridge home page shows the hand entry form inline above the list
 * of saved hands, so adding a hand is a single scroll-free flow: fill
 * in the bids and save. Bridge data is persisted in `localStorage`
 * (key `bridge:hands`), so `goto()` clears it via an init script to
 * give every test a clean slate.
 */

import { Page, expect } from '@playwright/test';

type Direction = 'north' | 'south' | 'east' | 'west';
type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'no-trump';

const STORAGE_KEY = 'bridge:hands';

export class BridgePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.addInitScript(
      (key) => window.localStorage.removeItem(key),
      STORAGE_KEY,
    );
    await this.page.goto('/bridge');
    await this.page.getByTestId('hand-form').waitFor({ state: 'visible' });
  }

  async expectToBeOnBridgePage() {
    await expect(this.page).toHaveURL(/\/bridge/);
    await expect(
      this.page.getByRole('heading', { name: 'Bridge' }),
    ).toBeVisible();
  }

  async setBid(direction: Direction, level: number, suit: Suit) {
    await this.page.getByTestId(`bid-${direction}-level-${level}`).click();
    await this.page.getByTestId(`bid-${direction}-suit`).selectOption(suit);
  }

  async setNotes(text: string) {
    await this.page.getByTestId('hand-notes').fill(text);
  }

  async saveHand() {
    const btn = this.page.getByTestId('save-hand-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async expectHandInList() {
    await expect(this.page.getByTestId('hand-list')).toBeVisible();
  }

  /**
   * Assert the bid in a given direction on the first hand card.
   * IDs are generated client-side, so we look the card up by position.
   */
  async expectFirstCardBid(direction: Direction, text: string) {
    const card = this.page
      .locator('[data-testid^="hand-card-"]')
      .first();
    await expect(
      card.locator(`[data-testid$="-${direction}-bid"]`),
    ).toHaveText(text);
  }

  async expectCardCount(count: number) {
    await expect(this.page.locator('[data-testid^="hand-card-"]')).toHaveCount(
      count,
    );
  }
}
