/**
 * Pictionary Page Object Model
 *
 * Encapsulates the four screens of the pictionary module: list,
 * create form, edit form, and detail.
 */

import { Page, expect } from '@playwright/test';

export class PictionaryPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/pictionary');
  }

  async expectToBeOnPictionaryPage() {
    await expect(this.page).toHaveURL(/\/pictionary/);
    await expect(
      this.page.getByRole('heading', { name: 'Pictionary' }),
    ).toBeVisible();
  }

  async clickNewGame() {
    const btn = this.page.getByTestId('new-pictionary-game-button');
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  async fillDate(yyyyMmDd: string) {
    await this.page.getByTestId('pictionary-date').fill(yyyyMmDd);
  }

  async fillLocation(value: string) {
    await this.page.getByTestId('pictionary-location').fill(value);
  }

  async fillWinningWord(value: string) {
    await this.page.getByTestId('pictionary-winning-word').fill(value);
  }

  async fillNotes(value: string) {
    await this.page.getByTestId('pictionary-notes').fill(value);
  }

  async addTeam() {
    await this.page.getByTestId('add-team-button').click();
  }

  async addPlayerToTeam(teamIndex: number, personId: string) {
    await this.page
      .getByTestId(`team-${teamIndex}-player-${personId}`)
      .click();
  }

  async setWinner(teamIndex: number) {
    await this.page.getByTestId(`team-${teamIndex}-winner`).click();
  }

  async submit() {
    await this.page.getByTestId('pictionary-submit-button').click();
  }

  async expectGameInList() {
    await this.page
      .getByTestId('pictionary-game-list')
      .waitFor({ state: 'visible' });
  }

  async openFirstGame() {
    const list = this.page.getByTestId('pictionary-game-list');
    await list.waitFor({ state: 'visible' });
    await list.locator('button[data-testid^="pictionary-game-item-"]').first().click();
  }

  async expectWinningTeamPlayer(playerName: string) {
    await expect(
      this.page.getByTestId('pictionary-winner-banner'),
    ).toContainText(playerName);
  }

  async expectWinningWord(word: string) {
    // The winning word is rendered both in the list and the detail summary.
    await expect(this.page.getByText(word).first()).toBeVisible();
  }

  async clickEdit() {
    await this.page.getByTestId('pictionary-edit-button').click();
  }

  async clickDelete() {
    await this.page.getByTestId('pictionary-delete-button').click();
  }

  async confirmDeleteInDialog() {
    // The shared ConfirmDialog renders a "Delete" button.
    await this.page.getByRole('button', { name: 'Delete' }).last().click();
  }

  async expectEmptyState() {
    await expect(
      this.page.getByText(/No Pictionary games yet/i),
    ).toBeVisible();
  }
}
