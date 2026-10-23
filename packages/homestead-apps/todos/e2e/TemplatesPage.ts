/**
 * Templates Page Object Model — the dedicated /todos/templates screen where
 * list templates and their items are managed.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class TemplatesPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/todos/templates');
    await this.driver
      .getByTestId('templates-add-input')
      .waitFor({ state: 'visible' });
  }

  private cardFor(name: string): Locator {
    return this.driver
      .locator('[data-testid^="template-card-"]')
      .filter({ hasText: name })
      .first();
  }

  async createTemplate(name: string) {
    await this.driver.getByTestId('templates-add-input').fill(name);
    await this.driver.getByTestId('templates-add-submit').click();
    await this.cardFor(name).waitFor({ state: 'visible' });
  }

  async addItem(templateName: string, title: string) {
    const card = this.cardFor(templateName);
    await card.locator('input[placeholder="Add an item"]').fill(title);
    await card.getByRole('button', { name: 'Add item' }).click();
    await this.expect(card.getByText(title, { exact: true })).toBeVisible();
  }

  async removeItem(templateName: string, title: string) {
    const card = this.cardFor(templateName);
    await card
      .getByRole('button', { name: `Remove ${title}` })
      .click();
  }

  async addCategory(templateName: string, name: string) {
    const card = this.cardFor(templateName);
    await card.getByPlaceholder('Add a category').fill(name);
    await card.getByRole('button', { name: 'Add category' }).click();
    await this.expect(card.getByText(name, { exact: true })).toBeVisible();
  }

  async addItemInCategory(
    templateName: string,
    title: string,
    categoryName: string,
  ) {
    const card = this.cardFor(templateName);
    await card
      .getByRole('combobox', { name: 'Category for new item' })
      .selectOption({ label: categoryName });
    await card.locator('input[placeholder="Add an item"]').fill(title);
    await card.getByRole('button', { name: 'Add item' }).click();
    await this.expect(card.getByText(title, { exact: true })).toBeVisible();
  }

  async createListFrom(templateName: string) {
    await this.cardFor(templateName)
      .getByRole('button', { name: `Create a list from ${templateName}` })
      .click();
  }

  async deleteTemplate(templateName: string) {
    await this.cardFor(templateName)
      .getByRole('button', { name: `Delete template ${templateName}` })
      .click();
    await this.driver.getByRole('button', { name: 'Delete' }).click();
  }

  async expectItem(templateName: string, title: string) {
    await this.expect(
      this.cardFor(templateName).getByText(title, { exact: true }),
    ).toBeVisible();
  }

  async expectItemAbsent(templateName: string, title: string) {
    await this.expect(
      this.cardFor(templateName).getByText(title, { exact: true }),
    ).toHaveCount(0);
  }

  async expectTemplateAbsent(templateName: string) {
    await this.expect(this.cardFor(templateName)).toHaveCount(0);
  }
}
