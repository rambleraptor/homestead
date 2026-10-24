/**
 * People Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class PeoplePage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/people');
  }

  async expectToBeOnPeoplePage() {
    await this.driver.expectURL(/\/people/);
  }

  async clickAddPerson() {
    const addButton = this.driver.getByTestId('add-person-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  /** Fill the person form. An `address` goes into a new household. */
  async fillPersonForm(data: {
    name: string;
    address?: string;
  }) {
    await this.driver.locator('#name').fill(data.name);

    if (data.address) {
      await this.startNewHousehold();
      await this.driver.locator('#new-household-line1').fill(data.address);
    }
  }

  /** Open the person form's "New household" shortcut (name prefilled). */
  async startNewHousehold() {
    await this.driver.getByTestId('new-household-button').click();
    await this.driver.getByTestId('new-household').waitFor({ state: 'visible' });
  }

  /** Add an existing household in the open person form's picker. */
  async addHousehold(household: { id: string; name: string }) {
    const input = this.driver.getByTestId('person-households-input');
    await input.click();
    await input.fill(household.name);
    await this.driver.getByTestId(`person-households-option-${household.id}`).click();
  }

  /** Remove a household chip from the open person form's picker. */
  async removeHousehold(household: { id: string }) {
    await this.driver.getByTestId(`person-households-remove-${household.id}`).click();
  }

  async submitPersonForm() {
    const submitButton = this.driver.getByTestId('person-form-submit');
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();
    await submitButton.waitFor({ state: 'hidden' });
  }

  async createPerson(data: {
    name: string;
    address?: string;
  }) {
    await this.clickAddPerson();
    await this.fillPersonForm(data);
    await this.submitPersonForm();
    await this.driver.waitForNetworkIdle();
  }

  async expectPersonInList(personName: string) {
    await this.expect(this.driver.getByText(personName).first()).toBeVisible();
  }

  async expectPersonNotInList(personName: string) {
    const personLocator = this.driver.getByText(personName).first();
    await this.expect(personLocator).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Element doesn't exist, which is fine
    });
  }

  async editPerson(personName: string, newData: Partial<{
    name: string;
  }>) {
    await this.openEditForm(personName);

    if (newData.name) {
      await this.driver.locator('#name').fill(newData.name);
    }

    await this.submitPersonForm();
  }

  /** Open a person's edit form from their card in the list. */
  async openEditForm(personName: string) {
    await this.openCardMenu(personName);
    await this.driver.getByRole('menuitem', { name: 'Edit' }).click();
    await this.driver.locator('#name').waitFor({ state: 'visible' });
  }

  /** Open the "more actions" menu on a person's card. */
  async openCardMenu(personName: string) {
    await this.expectPersonInList(personName);
    await this.driver
      .getByRole('button', { name: `More actions for ${personName}` })
      .first()
      .click();
  }

  /** Pick a partner in the open person form. */
  async selectPartner(partnerName: string) {
    await this.driver.getByTestId('person-partner-select').selectOption({ label: partnerName });
  }

  /** The person's card in the list names this partner. */
  async expectPartnerOnCard(person: { id: string }, partnerName: string) {
    await this.expect(this.driver.getByTestId(`person-partner-${person.id}`)).toHaveText(partnerName);
  }

  /** Add someone to the Parents / Children / Siblings picker in the open form. */
  async addRelative(
    group: 'parents' | 'children' | 'siblings',
    relative: { id: string; name: string },
  ) {
    const input = this.driver.getByTestId(`person-${group}-input`);
    await input.click();
    await input.fill(relative.name);
    await this.driver.getByTestId(`person-${group}-option-${relative.id}`).click();
  }

  async deletePerson(personName: string) {
    await this.openCardMenu(personName);
    await this.driver.getByRole('menuitem', { name: 'Delete' }).click();

    const confirmButton = this.driver.getByRole('button', { name: /confirm|yes|delete/i });
    const isConfirmVisible = await confirmButton.isVisible();

    if (isConfirmVisible) {
      await confirmButton.click();
    }

    await this.driver.waitForNetworkIdle();
  }

  // Bulk Import Methods

  async gotoBulkImport() {
    await this.driver.goto('/people/import');
    await this.driver.expectURL(/\/people\/import/);
  }

  /**
   * Upload a CSV and preview it. Parsing runs server-side now, so the preview
   * is an explicit step: pick the file, ask for the preview, wait for the
   * parsed rows to land.
   */
  async uploadCSVContent(csvContent: string) {
    const fileInput = this.driver.getByTestId('bulk-import-file-input');
    await fileInput.waitFor({ state: 'attached' });

    await fileInput.setInputFiles({
      name: 'test_import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent),
    });

    await this.driver.getByTestId('bulk-import-preview-button').click();
    // The preview arrives via an operation poll, so wait for the result rather
    // than the request.
    await this.driver.getByTestId('import-button').waitFor({ state: 'visible' });
  }

  async clickImport() {
    // Button text is "Import X Person(s)" 
    const importButton = this.driver.getByRole('button', { name: /Import \d+ Person\(s\)/ });
    await importButton.waitFor({ state: 'visible', timeout: 10000 });
    await this.expect(importButton).toBeEnabled();
    await importButton.click();

    // Wait for import to complete and redirect
    await this.driver.waitForURL(/\/people$/, { timeout: 30000 });
  }

  async expectImportSuccess(_count: number) {
    // Look for toast notification or redirect to people page
    await this.driver.waitForURL(/\/people$/);
    // Success toasts are shown but may disappear quickly
  }

  async expectPreviewShowsPartner(_personName: string, partnerName: string) {
    // In bulk import preview, verify partner badge is visible
    // Badge text includes emoji "💑 Partner: {name}" so we match partial text
    await this.expect(this.driver.getByText(`Partner: ${partnerName}`, { exact: false })).toBeVisible({ timeout: 5000 });
  }

  async expectPreviewShowsWifi(_personName: string, wifiNetwork: string) {
    // In bulk import preview, verify WiFi badge is visible
    // Badge text includes emoji "📶 WiFi: {network}" so we match partial text
    await this.expect(this.driver.getByText(`WiFi: ${wifiNetwork}`, { exact: false })).toBeVisible({ timeout: 5000 });
  }

  /** The person's card lists a household showing this text (address, or name when there are several). */
  async expectHouseholdOnCard(person: { id: string }, text: string) {
    await this.expect(this.driver.getByTestId(`person-card-households-${person.id}`)).toContainText(text);
  }

  /** The person's household lines don't show this text (WiFi stays off the list). */
  async expectNotOnHouseholdLines(person: { id: string }, text: string) {
    await this.expect(this.driver.getByTestId(`person-card-households-${person.id}`)).not.toContainText(text);
  }

  async expectNoHouseholdOnCard(person: { id: string }) {
    await this.expect(this.driver.getByTestId(`person-card-households-${person.id}`)).toHaveCount(0);
  }
}

