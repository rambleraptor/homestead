/**
 * Notes Page Object Model, written against the shared `Driver` so it serves
 * both the VM tier and Playwright.
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class NotesPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/notes');
    await this.expect(this.driver.getByTestId('notes-home')).toBeVisible();
  }

  /** A note's row, found by its text. */
  note(text: string): Locator {
    return this.driver.getByTestId('note-row').filter({ hasText: text });
  }

  async write(body: string) {
    await this.driver.getByTestId('notes-composer-input').fill(body);
    await this.driver.getByTestId('notes-composer-submit').click();
  }

  /** Save with the keyboard shortcut instead of the button. */
  async writeWithShortcut(body: string) {
    const input = this.driver.getByTestId('notes-composer-input');
    await input.fill(body);
    await input.press('Control+Enter');
  }

  async search(query: string) {
    await this.driver.getByTestId('notes-search').fill(query);
  }

  async clearSearch() {
    await this.driver.getByTestId('notes-search-clear').click();
  }

  async clickTag(text: string, tag: string) {
    await this.note(text).getByTestId(`note-tag-${tag}`).click();
  }

  async open(text: string) {
    await this.note(text).getByTestId('note-body').click();
  }

  async edit(text: string, newBody: string) {
    await this.open(text);
    await this.driver.getByTestId('note-edit-input').fill(newBody);
    await this.driver.getByTestId('note-edit-save').click();
  }

  async toggleStruck(text: string) {
    await this.open(text);
    await this.driver.getByTestId('note-toggle-struck').click();
  }

  async delete(text: string) {
    await this.open(text);
    await this.driver.getByTestId('note-delete').click();
  }

  async undo() {
    await this.driver.getByRole('button', { name: 'Undo' }).click();
  }

  async expectNote(text: string) {
    await this.expect(this.note(text)).toBeVisible();
  }

  async expectNoNote(text: string) {
    await this.expect(this.note(text)).toHaveCount(0);
  }

  async expectStruck(text: string) {
    await this.expect(this.note(text)).toHaveAttribute('data-struck', 'true');
  }

  async expectEmptyState() {
    await this.expect(this.driver.getByText('Your notebook is empty')).toBeVisible();
  }

  async expectComposerValue(value: string) {
    await this.expect(this.driver.getByTestId('notes-composer-input')).toHaveValue(value);
  }

  /** Start editing a note and type, without saving. */
  async startEditing(text: string, newBody: string) {
    await this.open(text);
    await this.driver.getByTestId('note-edit-input').fill(newBody);
  }

  async expectEditing(value: string) {
    await this.expect(this.driver.getByTestId('note-edit-input')).toHaveValue(value);
  }

  get syncStatus(): Locator {
    return this.driver.getByTestId('sync-status');
  }

  /** The "waiting to sync" mark on one note. */
  pendingMark(text: string): Locator {
    return this.note(text).getByTestId('pending-sync-badge');
  }

  async expectMatchCount(text: string) {
    await this.expect(this.driver.getByTestId('notes-match-count')).toHaveText(text);
  }
}
