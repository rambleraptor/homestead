/**
 * Bridge Page Object Model
 *
 * Covers the two views of the bridge module: hand list + new-hand form.
 */

import { Page, expect } from '@playwright/test';

type Direction = 'north' | 'south' | 'east' | 'west';
type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'no-trump';

export class BridgePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/bridge');
  }

  async expectToBeOnBridgePage() {
    await expect(this.page).toHaveURL(/\/bridge/);
    await expect(
      this.page.getByRole('heading', { name: 'Bridge' }),
    ).toBeVisible();
  }

  async clickNewHand() {
    const btn = this.page.getByTestId('new-hand-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    await this.page.getByTestId('hand-form').waitFor({ state: 'visible' });
  }

  async setBid(direction: Direction, level: number, suit: Suit) {
    await this.page.getByTestId(`bid-${direction}-level-${level}`).click();
    await this.page
      .getByTestId(`bid-${direction}-suit`)
      .selectOption(suit);
  }

  async setNotes(text: string) {
    const notes = this.page.getByTestId('hand-notes');
    await notes.fill(text);
  }

  async saveHand() {
    const btn = this.page.getByTestId('save-hand-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
    await this.page.getByTestId('hand-list').waitFor({ state: 'visible' });
  }

  async expectHandInList() {
    await expect(this.page.getByTestId('hand-list')).toBeVisible();
  }

  async expectBidInCard(handId: string, direction: Direction, text: string) {
    await expect(
      this.page.getByTestId(`hand-${handId}-${direction}-bid`),
    ).toHaveText(text);
  }

  async deleteFirstHand() {
    const deleteButtons = this.page.locator('[data-testid^="hand-"][data-testid$="-delete"]');
    await deleteButtons.first().click();
  }
}
