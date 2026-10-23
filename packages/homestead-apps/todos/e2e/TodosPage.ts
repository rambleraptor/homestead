/**
 * Todos Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class TodosPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/todos');
    await this.driver.getByTestId('todos-add-input').waitFor({ state: 'visible' });
  }

  /**
   * Add a todo. Both buttons are offered in every list — private (the default)
   * and shared — so `kind` selects between them wherever we are.
   */
  async addTodo(title: string, kind: 'personal' | 'family' = 'personal') {
    const input = this.driver.getByTestId('todos-add-input');
    await input.fill(title);
    await this.driver
      .getByTestId(
        kind === 'family'
          ? 'todos-add-submit-family'
          : 'todos-add-submit-personal',
      )
      .click();
    await this.expect(input).toHaveValue('');
  }

  async addPersonalTodo(title: string) {
    await this.addTodo(title, 'personal');
  }

  async addFamilyTodo(title: string) {
    await this.addTodo(title, 'family');
  }

  private async rowTestId(title: string): Promise<string> {
    const row = this.rowFor(title);
    await row.waitFor({ state: 'visible' });
    const testId = await row.getAttribute('data-testid');
    if (!testId) throw new Error(`Row for "${title}" missing testid`);
    return testId;
  }

  /**
   * A row's kind is shown as a coloured rail before the title — terracotta for
   * personal, navy for family — matching the button that created it.
   */
  async expectKindMarker(title: string, kind: 'personal' | 'family') {
    const testId = await this.rowTestId(title);
    await this.expect(this.driver.getByTestId(`${testId}-${kind}`)).toBeVisible();
    const other = kind === 'family' ? 'personal' : 'family';
    await this.expect(this.driver.getByTestId(`${testId}-${other}`)).toHaveCount(0);
  }

  // --- Categories (project view) ---

  /** Expand the (collapsed-by-default) category manager panel if needed. */
  async openCategoryManager() {
    const toggle = this.driver.getByTestId('todos-category-manager-toggle');
    if ((await toggle.getAttribute('aria-expanded')) === 'false') {
      await toggle.click();
    }
  }

  async addCategory(name: string) {
    await this.openCategoryManager();
    await this.driver.getByTestId('todos-category-add-input').fill(name);
    await this.driver.getByTestId('todos-category-add-submit').click();
    await this.expect(
      this.driver.getByTestId('todos-category-list').getByText(name, {
        exact: true,
      }),
    ).toBeVisible();
  }

  /** Choose the category new todos are added into ('' clears to Uncategorized). */
  async selectAddCategory(name: string) {
    await this.driver
      .getByTestId('todos-add-category')
      .selectOption({ label: name });
  }

  async deleteCategory(name: string) {
    await this.openCategoryManager();
    const item = this.driver
      .locator('[data-testid^="todos-category-item-"]')
      .filter({ hasText: name })
      .first();
    await item.getByRole('button', { name: `Delete category ${name}` }).click();
  }

  private categoryGroup(name: string): Locator {
    return this.driver
      .locator('[data-testid^="todos-category-group-"]')
      .filter({ hasText: name })
      .first();
  }

  async expectCategoryGroupVisible(name: string) {
    await this.expect(this.categoryGroup(name)).toBeVisible();
  }

  /** The named todo appears inside the group whose header is `categoryName`. */
  async expectTodoInGroup(categoryName: string, title: string) {
    await this.expect(
      this.categoryGroup(categoryName).getByText(title, { exact: true }),
    ).toBeVisible();
  }

  private rowFor(title: string) {
    return this.driver
      .locator('[data-testid^="todo-row-"]')
      .filter({ hasText: title })
      .first();
  }

  private async clickRowAction(title: string, action: string) {
    const row = this.rowFor(title);
    await row.waitFor({ state: 'visible' });
    const testId = await row.getAttribute('data-testid');
    if (!testId) throw new Error(`Row for "${title}" missing testid`);
    await this.driver.getByTestId(`${testId}-${action}`).click();
  }

  async markComplete(title: string) {
    await this.clickRowAction(title, 'complete');
  }

  async moveToDoLater(title: string) {
    await this.clickRowAction(title, 'dolater');
  }

  async cancel(title: string) {
    await this.clickRowAction(title, 'cancel');
  }

  /** Bring a Do Later item back to the active list. */
  async restore(title: string) {
    await this.clickRowAction(title, 'restore');
  }

  /** Open the list dropdown (no-op if it's already open). */
  private async openListMenu() {
    const menu = this.driver.getByTestId('todos-list-menu');
    if (await menu.isVisible()) return;
    await this.driver.getByTestId('todos-list-selector').click();
    await menu.waitFor({ state: 'visible' });
  }

  private async closeListMenu() {
    const menu = this.driver.getByTestId('todos-list-menu');
    if (!(await menu.isVisible())) return;
    await this.driver.getByTestId('todos-list-selector').click();
    await menu.waitFor({ state: 'hidden' });
  }

  /** The trigger names the list in view, so it's what "which list" asserts on. */
  async expectActiveList(name: string) {
    await this.expect(this.driver.getByTestId('todos-list-selector')).toContainText(
      name,
    );
  }

  /** The trigger's "Temporary" badge — shown only on a list that deletes itself. */
  async expectTemporaryBadge(visible: boolean) {
    const badge = this.driver.getByTestId('todos-list-temporary');
    if (visible) await this.expect(badge).toBeVisible();
    else await this.expect(badge).toHaveCount(0);
  }

  async selectMainProject() {
    await this.openListMenu();
    await this.driver.getByTestId('todos-list-option-main').click();
    await this.expectActiveList('Main');
  }

  async selectProject(name: string) {
    await this.openListMenu();
    await this.driver
      .getByTestId(/^todos-list-option-/)
      .filter({ hasText: name })
      .first()
      .click();
    await this.expectActiveList(name);
  }

  async createProject(name: string) {
    await this.openListMenu();
    await this.driver.getByTestId('todos-project-add').click();
    await this.driver.getByTestId('todos-project-name-input').fill(name);
    await this.driver.getByTestId('todos-project-create-submit').click();
    // After create, the new list becomes the active one.
    await this.expectActiveList(name);
  }

  async createListFromTemplate(templateName: string) {
    await this.openListMenu();
    await this.driver
      .getByTestId('todos-template-menu')
      .getByText(templateName, { exact: true })
      .click();
  }

  async gotoTemplates() {
    await this.openListMenu();
    await this.driver.getByTestId('todos-templates-link').click();
  }

  /**
   * Delete the active list. By default its todos move to Main; pass
   * `{ deleteTodos: true }` to remove the list's todos outright instead.
   */
  async deleteCurrentProject(opts: { deleteTodos?: boolean } = {}) {
    await this.openListMenu();
    await this.driver
      .locator('[data-testid^="todos-project-delete-"]')
      .first()
      .click();
    if (opts.deleteTodos) {
      await this.driver.getByTestId('todos-project-delete-todos').check();
    }
    await this.driver.getByRole('button', { name: 'Delete' }).click();
  }

  async pinToMain(title: string) {
    await this.clickRowAction(title, 'pin');
  }

  async unpinFromMain(title: string) {
    await this.clickRowAction(title, 'pin');
  }

  async expectRowVisible(title: string) {
    await this.expect(this.rowFor(title)).toBeVisible();
  }

  async expectRowAbsent(title: string) {
    await this.expect(this.rowFor(title)).toHaveCount(0);
  }

  /** The list is gone from the dropdown entirely. */
  async expectListAbsent(projectId: string) {
    await this.openListMenu();
    await this.expect(
      this.driver.getByTestId(`todos-list-option-${projectId}`),
    ).toHaveCount(0);
    await this.closeListMenu();
  }

  async expectInActive(title: string) {
    const section = this.driver.getByTestId('todos-section-active');
    await this.expect(section.getByText(title).first()).toBeVisible();
  }

  async expectInDoLater(title: string) {
    const section = this.driver.getByTestId('todos-section-dolater');
    await this.expect(section.getByText(title).first()).toBeVisible();
  }

  /** Undo the last status change from its toast. */
  async undoFromToast() {
    await this.driver.getByRole('button', { name: 'Undo' }).click();
  }
}
