/**
 * Bookmarks Page Object Model, written against the shared `Driver` so it
 * serves both the VM tier and Playwright.
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class BookmarksPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/bookmarks');
    await this.expect(this.driver.getByTestId('bookmarks-home')).toBeVisible();
  }

  /** Open one bookmark's address directly, as a link to it would. */
  async gotoBookmark(id: string) {
    await this.driver.goto(`/bookmarks/${id}`);
    await this.expect(this.driver.getByTestId('bookmarks-home')).toBeVisible();
  }

  /** A bookmark's row, found by its text (title, address or site). */
  row(text: string): Locator {
    return this.driver.getByTestId('bookmark-row').filter({ hasText: text });
  }

  get reader(): Locator {
    return this.driver.getByTestId('bookmark-reader');
  }

  /** Who the next link is saved for: `private` or `household`. */
  async chooseVisibility(visibility: 'private' | 'household') {
    await this.driver.getByTestId(`visibility-${visibility}`).click();
  }

  async save(link: string) {
    await this.driver.getByTestId('bookmark-save-input').fill(link);
    await this.driver.getByTestId('bookmark-save-submit').click();
  }

  async search(query: string) {
    await this.driver.getByTestId('bookmarks-search').fill(query);
  }

  async clearSearch() {
    await this.driver.getByTestId('bookmarks-search-clear').click();
  }

  /** `inbox`, `read`, `favorites` or `everything`. */
  async showShelf(shelf: 'inbox' | 'read' | 'favorites' | 'everything') {
    await this.driver.getByTestId(`bookmarks-shelf-${shelf}`).click();
  }

  /** `all`, `private` or `family`. */
  async showScope(scope: 'all' | 'private' | 'family') {
    await this.driver.getByTestId(`bookmarks-scope-${scope}`).click();
  }

  async filterByTag(tag: string) {
    await this.driver.getByTestId(`bookmarks-tag-${tag}`).click();
  }

  async open(text: string) {
    await this.row(text).getByTestId('bookmark-open').click();
    await this.expect(this.reader).toBeVisible();
  }

  async toggleFavorite(text: string) {
    await this.row(text).getByTestId('bookmark-favorite').click();
  }

  async toggleRead(text: string) {
    await this.row(text).getByTestId('bookmark-read').click();
  }

  async addTag(tag: string) {
    await this.driver.getByTestId('bookmark-tags-edit').click();
    const input = this.driver.getByTestId('bookmark-tags-input');
    await input.fill(tag);
    await input.press('Enter');
    await this.driver.getByTestId('bookmark-tags-done').click();
  }

  /** In the reader: save it again as the other kind (private ↔ family). */
  async move() {
    await this.driver.getByTestId('bookmark-move').click();
  }

  async fetchAgain() {
    await this.driver.getByTestId('bookmark-refetch').click();
  }

  async delete() {
    await this.driver.getByTestId('bookmark-delete').click();
  }

  async undo() {
    await this.driver.getByRole('button', { name: 'Undo' }).click();
  }

  /** Open "Save from iPhone" and make the shortcut's key, which shows the steps. */
  async createIphoneKey() {
    await this.driver.getByTestId('iphone-shortcut-open').click();
    await this.driver.getByTestId('iphone-shortcut-create-key').click();
    await this.expect(this.driver.getByTestId('iphone-shortcut-header')).toBeVisible();
  }

  /**
   * What the steps tell the shortcut to send: where, and signed in how. Read
   * from what a tap copies, not from what is shown (a key is shown shortened).
   */
  async iphoneShortcutRequest(): Promise<{ url: string; authorization: string }> {
    const url = await this.driver.getByTestId('iphone-shortcut-url').getAttribute('data-value');
    const authorization = await this.driver.getByTestId('iphone-shortcut-header').getAttribute('data-value');
    return { url: url ?? '', authorization: authorization ?? '' };
  }

  /** In the steps: whether the shortcut saves privately or for the family. */
  async chooseIphoneVisibility(visibility: 'private' | 'household') {
    await this.driver.getByTestId('iphone-shortcut').getByTestId(`visibility-${visibility}`).click();
  }

  async expectIphoneBodyVisibility(value: string) {
    await this.expect(this.driver.getByTestId('iphone-shortcut-body-visibility')).toHaveText(value);
  }

  async expectNoIphoneBodyVisibility() {
    await this.expect(this.driver.getByTestId('iphone-shortcut-body-visibility')).toHaveCount(0);
  }

  /**
   * With a drop box configured: open "Save from iPhone" and make a shortcut
   * address, saving as `visibility`. Returns the address a shortcut would post to.
   */
  async createIphoneAddress(visibility: 'private' | 'household' = 'private'): Promise<string> {
    await this.driver.getByTestId('iphone-shortcut-open').click();
    await this.chooseIphoneVisibility(visibility);
    await this.driver.getByTestId('iphone-shortcut-create').click();
    const address = this.driver.getByTestId('iphone-shortcut-url');
    await this.expect(address).toBeVisible();
    return (await address.getAttribute('data-value')) ?? '';
  }

  /** Leave the steps for the list of shortcuts already set up. */
  async finishIphoneSetup() {
    await this.driver.getByTestId('iphone-shortcut-done').click();
    await this.expect(this.driver.getByTestId('iphone-inbox')).toBeVisible();
  }

  async checkIphoneInboxNow() {
    await this.driver.getByTestId('iphone-inbox-check').click();
  }

  async removeIphoneInbox() {
    await this.driver.getByTestId('iphone-inbox-remove').click();
    await this.expect(this.driver.getByTestId('iphone-inbox')).toHaveCount(0);
  }

  async expectRowViaPhone(text: string) {
    await this.expect(this.row(text).getByTestId('bookmark-via-phone')).toBeVisible();
  }

  async closeDialog() {
    await this.driver.getByRole('button', { name: 'Close' }).click();
  }

  async expectBookmark(text: string) {
    await this.expect(this.row(text)).toBeVisible();
  }

  async expectNoBookmark(text: string) {
    await this.expect(this.row(text)).toHaveCount(0);
  }

  async expectEmptyState() {
    await this.expect(this.driver.getByText('Nothing saved yet')).toBeVisible();
  }

  async expectSaveError() {
    await this.expect(this.driver.getByTestId('bookmark-save-error')).toBeVisible();
  }

  async expectSaveInputValue(value: string) {
    await this.expect(this.driver.getByTestId('bookmark-save-input')).toHaveValue(value);
  }

  async expectMatchCount(text: string) {
    await this.expect(this.driver.getByTestId('bookmarks-match-count')).toHaveText(text);
  }

  /** The row says it is private (`private`) or the family's (`shared`). */
  async expectRowVisibility(text: string, visibility: 'private' | 'shared') {
    await this.expect(this.row(text).getByTestId(`visibility-badge-${visibility}`)).toBeVisible();
  }

  async expectRowRead(text: string, read: boolean) {
    await this.expect(this.row(text)).toHaveAttribute('data-read', read ? 'true' : 'false');
  }

  async expectRowFailed(text: string) {
    await this.expect(this.row(text).getByTestId('bookmark-failed')).toBeVisible();
  }

  async expectReaderTitle(title: string) {
    await this.expect(this.driver.getByTestId('bookmark-reader-title')).toHaveText(title);
  }

  async expectReaderText(text: string) {
    await this.expect(this.driver.getByTestId('bookmark-reader-body')).toContainText(text);
  }

  /** The line under the title: site, author, reading time. */
  async expectReaderMeta(text: string) {
    await this.expect(this.driver.getByTestId('bookmark-reader-meta')).toContainText(text);
  }

  async expectReaderFailed() {
    await this.expect(this.driver.getByTestId('bookmark-reader-failed')).toBeVisible();
  }

  async expectReaderTag(tag: string) {
    await this.expect(this.driver.getByTestId(`bookmark-reader-tag-${tag}`)).toBeVisible();
  }

  async expectMissing() {
    await this.expect(this.driver.getByText('This bookmark isn’t here')).toBeVisible();
  }
}
