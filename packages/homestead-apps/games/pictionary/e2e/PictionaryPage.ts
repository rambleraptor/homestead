/**
 * Pictionary Page Object Model
 *
 * Encapsulates the four screens of the pictionary app: list,
 * create form, edit form, and detail. Written against the shared
 * `Driver`, so it runs on the VM tier (`../vm/`) and, via
 * `playwrightDriver(page)`, in Playwright.
 */

import type { Driver, Locator } from '../../../../homestead-test-harness/driver/Driver';

export class PictionaryPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/games/pictionary');
  }

  async gotoLeaderboard() {
    await this.driver.goto('/games/pictionary/leaderboard');
  }

  async clickLeaderboard() {
    await this.driver.getByTestId('pictionary-leaderboard-button').click();
  }

  async expectToBeOnPictionaryPage() {
    await this.driver.expectURL(/\/games\/pictionary/);
    await this.expect(
      this.driver.getByRole('heading', { name: 'Pictionary' }),
    ).toBeVisible();
  }

  async expectToBeOnLeaderboardPage() {
    await this.driver.expectURL(/\/games\/pictionary\/leaderboard/);
    await this.expect(
      this.driver.getByRole('heading', { name: 'Pictionary Leaderboard' }),
    ).toBeVisible();
  }

  leaderboardRow(rowKey: string) {
    return this.driver.getByTestId(`pictionary-leaderboard-row-${rowKey}`);
  }

  async selectLeaderboardMode(mode: 'players' | 'teams') {
    await this.driver
      .getByTestId(`pictionary-leaderboard-mode-${mode}`)
      .click();
  }

  async expectLeaderboardEmpty() {
    await this.expect(
      this.driver.getByTestId('pictionary-leaderboard-empty'),
    ).toBeVisible();
  }

  async clickNewGame() {
    const btn = this.driver.getByTestId('new-pictionary-game-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async fillDate(yyyyMmDd: string) {
    await this.driver.getByTestId('pictionary-date').fill(yyyyMmDd);
  }

  async fillLocation(value: string) {
    await this.driver.getByTestId('pictionary-location').fill(value);
  }

  async fillWinningWord(value: string) {
    await this.driver.getByTestId('pictionary-winning-word').fill(value);
  }

  async fillNotes(value: string) {
    await this.driver.getByTestId('pictionary-notes').fill(value);
  }

  async addTeam() {
    await this.driver.getByTestId('add-team-button').click();
  }

  async addPlayerToTeam(teamIndex: number, personId: string) {
    await this.driver
      .getByTestId(`team-${teamIndex}-player-${personId}`)
      .click();
  }

  async setWinner(teamIndex: number) {
    await this.driver.getByTestId(`team-${teamIndex}-winner`).click();
  }

  async submit() {
    await this.driver.getByTestId('pictionary-submit-button').click();
  }

  async expectGameInList() {
    await this.driver
      .getByTestId('pictionary-game-list')
      .waitFor({ state: 'visible' });
  }

  async openFirstGame() {
    const list = this.driver.getByTestId('pictionary-game-list');
    await list.waitFor({ state: 'visible' });
    await list.locator('button[data-testid^="pictionary-game-item-"]').first().click();
  }

  async expectWinningTeamPlayer(playerName: string) {
    await this.expect(
      this.driver.getByTestId('pictionary-winner-banner'),
    ).toContainText(playerName);
  }

  async expectWinningWord(word: string) {
    // The winning word is rendered both in the list and the detail summary.
    await this.expect(this.driver.getByText(word).first()).toBeVisible();
  }

  async clickEdit() {
    await this.driver.getByTestId('pictionary-edit-button').click();
  }

  async clickDelete() {
    await this.driver.getByTestId('pictionary-delete-button').click();
  }

  async confirmDeleteInDialog() {
    // The shared ConfirmDialog renders a "Delete" button.
    await this.driver.getByRole('button', { name: 'Delete' }).last().click();
  }

  async expectEmptyState() {
    await this.expect(
      this.driver.getByText(/No Pictionary games yet/i),
    ).toBeVisible();
  }
}
