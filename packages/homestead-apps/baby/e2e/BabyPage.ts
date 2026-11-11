/**
 * Baby log Page Object Model, written against the shared `Driver` so it
 * serves both the VM tier and Playwright.
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

type StatusTile = 'feed' | 'diaper' | 'sleep';

export class BabyPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  /** Open the app on a household that already has a baby. */
  async goto(query = '') {
    await this.driver.goto(`/baby${query}`);
    await this.expect(this.driver.getByTestId('baby-home')).toBeVisible();
  }

  /** Open the app before any baby has been added. */
  async gotoSetup() {
    await this.driver.goto('/baby');
    await this.expect(this.driver.getByTestId('baby-setup')).toBeVisible();
  }

  async fillBaby(name: string, birthDate?: string) {
    await this.driver.getByTestId('baby-name-input').fill(name);
    if (birthDate !== undefined) await this.driver.getByTestId('baby-birth-date-input').fill(birthDate);
    await this.driver.getByTestId('baby-form-save').click();
  }

  async openBabyEditor() {
    await this.driver.getByTestId('baby-edit').click();
  }

  async logDiaper(kind: 'wet' | 'dirty' | 'both') {
    await this.driver.getByTestId(`baby-log-diaper-${kind}`).click();
  }

  /** Start nursing on a side — or stop, when that side is the one running. */
  async tapSide(side: 'left' | 'right') {
    await this.driver.getByTestId(`baby-log-feed-${side}`).click();
  }

  async toggleSleep() {
    await this.driver.getByTestId('baby-log-sleep').click();
  }

  async openBottle() {
    await this.driver.getByTestId('baby-log-feed-bottle').click();
    await this.expect(this.editor).toBeVisible();
  }

  get editor(): Locator {
    return this.driver.getByTestId('baby-event-editor');
  }

  async fillAmount(amount: string) {
    await this.driver.getByTestId('baby-event-amount').fill(amount);
  }

  async chooseUnit(unit: 'oz' | 'ml') {
    await this.driver.getByTestId(`baby-event-unit-${unit}`).click();
  }

  async chooseContents(contents: 'breast_milk' | 'formula') {
    await this.driver.getByTestId(`baby-event-contents-${contents}`).click();
  }

  async chooseDiaper(kind: 'wet' | 'dirty' | 'both') {
    await this.driver.getByTestId(`baby-event-diaper-${kind}`).click();
  }

  async fillNotes(notes: string) {
    await this.driver.getByTestId('baby-event-notes').fill(notes);
  }

  async fillEnded(value: string) {
    await this.driver.getByTestId('baby-event-ended').fill(value);
  }

  async saveEvent() {
    await this.driver.getByTestId('baby-event-save').click();
  }

  async deleteEvent() {
    await this.driver.getByTestId('baby-event-delete').click();
  }

  async undo() {
    await this.driver.getByRole('button', { name: 'Undo' }).click();
  }

  /** Timeline rows, optionally only those showing `text`. */
  rows(text?: string): Locator {
    const rows = this.driver.getByTestId('baby-event-row');
    return text === undefined ? rows : rows.filter({ hasText: text });
  }

  async openRow(text: string) {
    await this.rows(text).first().click();
    await this.expect(this.editor).toBeVisible();
  }

  async previousDay() {
    await this.driver.getByTestId('baby-day-prev').click();
  }

  status(tile: StatusTile): Locator {
    return this.driver.getByTestId(`baby-status-${tile}`);
  }

  async expectStatus(tile: StatusTile, text: string | RegExp) {
    await this.expect(this.status(tile)).toContainText(text);
  }

  async expectRow(text: string) {
    await this.expect(this.rows(text).first()).toBeVisible();
  }

  async expectNoRow(text: string) {
    await this.expect(this.rows(text)).toHaveCount(0);
  }

  async expectRowCount(count: number) {
    await this.expect(this.rows()).toHaveCount(count);
  }

  async expectTotals(text: string | RegExp) {
    await this.expect(this.driver.getByTestId('baby-day-totals')).toContainText(text);
  }

  async expectDay(label: string) {
    await this.expect(this.driver.getByTestId('baby-day-label')).toHaveText(label);
  }

  async expectBabyName(name: string) {
    await this.expect(this.driver.getByTestId('baby-name')).toHaveText(name);
  }

  async expectEditorClosed() {
    await this.expect(this.editor).toHaveCount(0);
  }
}
