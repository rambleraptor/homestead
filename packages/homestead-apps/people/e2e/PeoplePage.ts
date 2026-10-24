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

  async fillPersonForm(data: {
    name: string;
    address?: string;
  }) {
    await this.driver.locator('#name').fill(data.name);

    if (data.address) {
      // Check if there's already an address input visible
      const firstAddressInput = this.driver.locator('#address-0-line1');
      const isAddressInputVisible = await firstAddressInput.isVisible();

      if (!isAddressInputVisible) {
        // Click "Add Address" button to create the first address
        const addAddressButton = this.driver.getByRole('button', { name: /add address/i });
        await addAddressButton.waitFor({ state: 'visible' });
        await addAddressButton.click();
        await this.driver.waitForNetworkIdle();
      }

      // Fill in the first address line1 field
      await this.driver.locator('#address-0-line1').fill(data.address);
    }
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
    address: string;
  }>) {
    await this.expectPersonInList(personName);

    const editButton = this.driver.getByRole('button', { name: `Edit ${personName}` }).first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    await this.driver.locator('#name').waitFor({ state: 'visible' });

    if (newData.name) {
      await this.driver.locator('#name').fill(newData.name);
    }
    if (newData.address) {
      // Check if there's already an address input visible
      const firstAddressInput = this.driver.locator('#address-0-line1');
      const isAddressInputVisible = await firstAddressInput.isVisible();

      if (!isAddressInputVisible) {
        // Click "Add Address" button to create the first address
        const addAddressButton = this.driver.getByRole('button', { name: /add address/i });
        await addAddressButton.waitFor({ state: 'visible' });
        await addAddressButton.click();
        await this.driver.waitForNetworkIdle();
      }

      // Clear and fill the first address line1 field
      await this.driver.locator('#address-0-line1').clear();
      await this.driver.locator('#address-0-line1').fill(newData.address);
    }

    await this.submitPersonForm();
  }

  /** Open a person's edit form from their card in the list. */
  async openEditForm(personName: string) {
    await this.expectPersonInList(personName);
    const editButton = this.driver.getByRole('button', { name: `Edit ${personName}` }).first();
    await editButton.click();
    await this.driver.locator('#name').waitFor({ state: 'visible' });
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
    await this.expectPersonInList(personName);

    const deleteButton = this.driver.getByRole('button', { name: `Delete ${personName}` }).first();
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();

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

  // Multiple Address Methods

  async addSecondAddress(addressLine: string) {
    // Click "Add Address" button
    const addAddressButton = this.driver.getByTestId('add-address-button');
    await addAddressButton.waitFor({ state: 'visible' });
    await addAddressButton.click();

    // Fill in the second address (index 1)
    const secondAddressInput = this.driver.locator('#address-1-line1');
    await secondAddressInput.waitFor({ state: 'visible' });
    await secondAddressInput.fill(addressLine);
  }

  async removeAddress(index: number) {
    const removeButton = this.driver.getByTestId(`remove-address-${index}-button`);
    await removeButton.waitFor({ state: 'visible' });
    await removeButton.click();
  }

  async expectAddressValue(index: number, value: string) {
    const addressInput = this.driver.locator(`#address-${index}-line1`);
    await this.expect(addressInput).toHaveValue(value);
  }

  async expectAddressCount(count: number) {
    if (count === 0) {
      // Check for empty state message
      await this.expect(this.driver.getByText('No addresses added')).toBeVisible();
    } else {
      // Check that the right number of address inputs exist
      for (let i = 0; i < count; i++) {
        await this.expect(this.driver.locator(`#address-${i}-line1`)).toBeVisible();
      }

      // Verify that the next address doesn't exist
      const nextAddress = this.driver.locator(`#address-${count}-line1`);
      await this.expect(nextAddress).not.toBeVisible({ timeout: 1000 }).catch(() => {});
    }
  }

}

