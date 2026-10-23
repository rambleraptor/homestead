/**
 * Bridge Page Object Model
 *
 * The bridge home page shows a quick-entry form above the list of saved
 * hands. Entry is three button taps per direction: level (1-7), suit,
 * then the direction itself, which commits the bid. Once all four
 * directions are entered the hand auto-saves. Bridge data is persisted
 * in `localStorage` (key `bridge:hands`); every test starts from an empty
 * one (a fresh VM boot clears it), so there is nothing to reset here.
 *
 * Written against the shared `Driver`, so it runs on the VM tier (`../vm/`)
 * and, via `playwrightDriver(page)`, in Playwright.
 */

import type { Driver, Locator } from '../../../../homestead-test-harness/driver/Driver';

type Direction = 'north' | 'south' | 'east' | 'west';
type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'no-trump' | 'pass';

export class BridgePage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/games/bridge');
    await this.driver.getByTestId('hand-form').waitFor({ state: 'visible' });
  }

  async expectToBeOnBridgePage() {
    await this.driver.expectURL(/\/games\/bridge/);
    await this.expect(
      this.driver.getByRole('heading', { name: 'Bridge' }),
    ).toBeVisible();
  }

  /**
   * Enter a single direction's bid: level → suit → direction. For a
   * pass, omit level and pass `suit: 'pass'`.
   */
  async enterBid(direction: Direction, level: number | undefined, suit: Suit) {
    if (suit !== 'pass' && level !== undefined) {
      await this.driver.getByTestId(`level-${level}`).click();
    }
    await this.driver.getByTestId(`suit-${suit}`).click();
    await this.driver.getByTestId(`direction-${direction}`).click();
  }

  /** Choose which board (1-36) subsequent hands are recorded on. */
  async selectBoard(board: number) {
    await this.driver.getByTestId('board-select').selectOption(String(board));
  }

  /** Filter the saved-hands list to a single board via the pill row. */
  async filterByBoard(board: number) {
    await this.driver.getByTestId(`board-filter-${board}`).click();
  }

  /**
   * Enter all four directions in N/E/S/W order. The hand auto-saves
   * when the fourth direction is committed. Pass `board` to record the
   * hand on a specific board first.
   */
  async enterHand(
    bids: Record<Direction, { level?: number; suit: Suit }>,
    board?: number,
  ) {
    if (board !== undefined) {
      await this.selectBoard(board);
    }
    const order: Direction[] = ['north', 'east', 'south', 'west'];
    for (const dir of order) {
      await this.enterBid(dir, bids[dir].level, bids[dir].suit);
    }
  }

  async expectHandInList() {
    await this.expect(this.driver.getByTestId('hand-list')).toBeVisible();
  }

  /**
   * Assert the bid in a given direction on the first hand card.
   * IDs are generated client-side, so we look the card up by position.
   */
  async expectFirstCardBid(direction: Direction, text: string) {
    const card = this.driver
      .locator('[data-testid^="hand-card-"]')
      .first();
    await this.expect(
      card.locator(`[data-testid$="-${direction}-bid"]`),
    ).toHaveText(text);
  }

  /** Assert the board label shown on the first hand card. */
  async expectFirstCardBoard(text: string) {
    const card = this.driver.locator('[data-testid^="hand-card-"]').first();
    await this.expect(card.locator('[data-testid$="-board"]')).toHaveText(text);
  }

  async expectCardCount(count: number) {
    await this.expect(this.driver.locator('[data-testid^="hand-card-"]')).toHaveCount(
      count,
    );
  }
}
