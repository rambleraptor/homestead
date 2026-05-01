/**
 * Todos Page Object Model
 */

import { Page, expect } from '@playwright/test';

export class TodosPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/todos');
    await this.page.getByTestId('todos-add-input').waitFor({ state: 'visible' });
  }

  async addTodo(title: string) {
    const input = this.page.getByTestId('todos-add-input');
    await input.fill(title);
    await this.page.getByTestId('todos-add-submit').click();
    await expect(input).toHaveValue('');
  }

  private rowFor(title: string) {
    return this.page
      .locator('[data-testid^="todo-row-"]')
      .filter({ hasText: title })
      .first();
  }

  private async clickRowAction(title: string, action: string) {
    const row = this.rowFor(title);
    await row.waitFor({ state: 'visible' });
    const testId = await row.getAttribute('data-testid');
    if (!testId) throw new Error(`Row for "${title}" missing testid`);
    await this.page.getByTestId(`${testId}-${action}`).click();
  }

  async markComplete(title: string) {
    await this.clickRowAction(title, 'complete');
  }

  async markInProgress(title: string) {
    await this.clickRowAction(title, 'inprogress');
  }

  async moveToDoLater(title: string) {
    await this.clickRowAction(title, 'dolater');
  }

  async cancel(title: string) {
    await this.clickRowAction(title, 'cancel');
  }

  async undo(title: string) {
    await this.clickRowAction(title, 'undo');
  }

  async resetProgress() {
    await this.page.getByTestId('todos-reset').click();
    await this.page.getByRole('button', { name: 'Reset' }).click();
  }

  async expectInActive(title: string) {
    const section = this.page.getByTestId('todos-section-active');
    await expect(section.getByText(title).first()).toBeVisible();
  }

  async expectInDoLater(title: string) {
    const section = this.page.getByTestId('todos-section-dolater');
    await expect(section.getByText(title).first()).toBeVisible();
  }

  async expectInCompleted(title: string) {
    const toggle = this.page.getByTestId('todos-section-completed-toggle');
    if ((await toggle.getAttribute('aria-expanded')) === 'false') {
      await toggle.click();
    }
    const section = this.page.getByTestId('todos-section-completed');
    await expect(section.getByText(title).first()).toBeVisible();
  }

  async expectGreenSegmentNonZero() {
    const green = this.page.getByTestId('todos-progress-green');
    await expect(green).toBeVisible();
    const width = await green.evaluate(
      (el) => (el as HTMLElement).style.width || '0%',
    );
    if (width === '0%' || width === '') {
      throw new Error(`Expected green segment width > 0, got "${width}"`);
    }
  }

  async expectGreenSegmentZero() {
    const green = this.page.getByTestId('todos-progress-green');
    const width = await green.evaluate(
      (el) => (el as HTMLElement).style.width || '0%',
    );
    expect(width).toBe('0%');
  }
}
