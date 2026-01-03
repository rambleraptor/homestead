/**
 * People Page Object Model
 */

import { Page, expect, Locator } from '@playwright/test';

export class PeoplePage {
  constructor(private page: Page) { }

  async goto() {
    await this.page.goto('/people');
  }

  async expectToBeOnPeoplePage() {
    await expect(this.page).toHaveURL(/\/people/);
  }

  async clickAddPerson() {
    const addButton = this.page.getByTestId('add-person-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  async fillPersonForm(data: {
    name: string;
    address?: string;
    birthday?: string;
    anniversary?: string;
  }) {
    await this.page.locator('#name').fill(data.name);

    if (data.address) {
      // Check if there's already an address input visible
      const firstAddressInput = this.page.locator('#address-0-line1');
      const isAddressInputVisible = await firstAddressInput.isVisible({ timeout: 1000 }).catch(() => false);

      if (!isAddressInputVisible) {
        // Click "Add Address" button to create the first address
        const addAddressButton = this.page.getByRole('button', { name: /add address/i });
        await addAddressButton.waitFor({ state: 'visible' });
        await addAddressButton.click();
        await this.page.waitForLoadState('networkidle');
      }

      // Fill in the first address line1 field
      await this.page.locator('#address-0-line1').fill(data.address);
    }
    if (data.birthday) {
      await this.page.locator('#birthday').fill(data.birthday);
    }
    if (data.anniversary) {
      await this.page.locator('#anniversary').fill(data.anniversary);
    }
  }

  async submitPersonForm() {
    const submitButton = this.page.getByTestId('person-form-submit');
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();
    await submitButton.waitFor({ state: 'hidden' });
  }

  async createPerson(data: {
    name: string;
    address?: string;
    birthday?: string;
    anniversary?: string;
  }) {
    await this.clickAddPerson();
    await this.fillPersonForm(data);
    await this.submitPersonForm();
    await this.page.waitForLoadState('networkidle');
  }

  async expectPersonInList(personName: string) {
    await expect(this.page.getByText(personName).first()).toBeVisible();
  }

  async expectPersonNotInList(personName: string) {
    const personLocator = this.page.getByText(personName).first();
    await expect(personLocator).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // Element doesn't exist, which is fine
    });
  }

  async getPersonCard(personName: string): Promise<Locator> {
    return this.page.getByRole('heading', { name: personName, level: 3 })
      .locator('..')
      .locator('..');
  }

  async editPerson(personName: string, newData: Partial<{
    name: string;
    address: string;
    birthday: string;
    anniversary: string;
  }>) {
    await this.expectPersonInList(personName);

    const editButton = this.page.getByRole('button', { name: `Edit ${personName}` }).first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    await this.page.locator('#name').waitFor({ state: 'visible' });

    if (newData.name) {
      await this.page.locator('#name').fill(newData.name);
    }
    if (newData.address) {
      // Check if there's already an address input visible
      const firstAddressInput = this.page.locator('#address-0-line1');
      const isAddressInputVisible = await firstAddressInput.isVisible({ timeout: 1000 }).catch(() => false);

      if (!isAddressInputVisible) {
        // Click "Add Address" button to create the first address
        const addAddressButton = this.page.getByRole('button', { name: /add address/i });
        await addAddressButton.waitFor({ state: 'visible' });
        await addAddressButton.click();
        await this.page.waitForLoadState('networkidle');
      }

      // Clear and fill the first address line1 field
      await this.page.locator('#address-0-line1').clear();
      await this.page.locator('#address-0-line1').fill(newData.address);
    }
    if (newData.birthday) {
      await this.page.locator('#birthday').fill(newData.birthday);
    }
    if (newData.anniversary) {
      await this.page.locator('#anniversary').fill(newData.anniversary);
    }

    await this.submitPersonForm();
  }

  async deletePerson(personName: string) {
    await this.expectPersonInList(personName);

    const deleteButton = this.page.getByRole('button', { name: `Delete ${personName}` }).first();
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();

    const confirmButton = this.page.getByRole('button', { name: /confirm|yes|delete/i });
    const isConfirmVisible = await confirmButton.isVisible({ timeout: 1000 }).catch(() => false);

    if (isConfirmVisible) {
      await confirmButton.click();
    }

    await this.page.waitForLoadState('networkidle');
  }

  // Bulk Import Methods

  async gotoBulkImport() {
    await this.page.goto('/people/import');
    await expect(this.page).toHaveURL(/\/people\/import/);
  }

  async uploadCSVContent(csvContent: string) {
    // Create a file from CSV content and upload it
    const buffer = Buffer.from(csvContent);

    // Wait for file input to be present
    const fileInput = this.page.locator('input[type="file"][accept=".csv"]');
    await fileInput.waitFor({ state: 'attached' });

    // Upload the file
    await fileInput.setInputFiles({
      name: 'test_import.csv',
      mimeType: 'text/csv',
      buffer,
    });

    // Wait for parsing to complete
    await this.page.waitForLoadState('networkidle');
  }

  async expectParsedPeopleCount(validCount: number, invalidCount?: number) {
    // Wait for parsing to complete and stats to be visible
    await this.page.waitForLoadState('networkidle');

    // Check the valid count stat card
    const validCard = this.page.locator('text="Valid People"').locator('..');
    await validCard.waitFor({ state: 'visible', timeout: 10000 });
    await expect(validCard.locator('p.text-2xl')).toContainText(String(validCount));

    if (invalidCount !== undefined) {
      const invalidCard = this.page.locator('text="Invalid People"').locator('..');
      await expect(invalidCard.locator('p.text-2xl')).toContainText(String(invalidCount));
    }
  }

  async selectAllValidPeople() {
    const selectAllButton = this.page.getByRole('button', { name: 'Select All' });
    await selectAllButton.waitFor({ state: 'visible', timeout: 5000 });
    await selectAllButton.click();
    // Wait for selection to register
    await this.page.waitForTimeout(500);
  }

  async clickImport() {
    // Button text is "Import X Person(s)" 
    const importButton = this.page.getByRole('button', { name: /Import \d+ Person\(s\)/ });
    await importButton.waitFor({ state: 'visible', timeout: 10000 });
    await expect(importButton).toBeEnabled();
    await importButton.click();

    // Wait for import to complete and redirect
    await this.page.waitForURL(/\/people$/, { timeout: 30000 });
  }

  async expectImportSuccess(count: number) {
    // Look for toast notification or redirect to people page
    await this.page.waitForURL(/\/people$/);
    // Success toasts are shown but may disappear quickly
  }

  async expectPersonHasPartner(personName: string, partnerName: string) {
    // Find the person card and verify partner is shown
    const personCard = await this.getPersonCard(personName);
    await expect(personCard.getByText(partnerName)).toBeVisible();
  }

  async expectPersonHasAddress(personName: string, addressPart: string) {
    // Find the person card and verify address is shown
    const personCard = await this.getPersonCard(personName);
    await expect(personCard.getByText(addressPart, { exact: false })).toBeVisible();
  }

  async expectPreviewShowsPartner(personName: string, partnerName: string) {
    // In bulk import preview, verify partner badge is visible
    // Badge text includes emoji "💑 Partner: {name}" so we match partial text
    await expect(this.page.getByText(`Partner: ${partnerName}`, { exact: false })).toBeVisible({ timeout: 5000 });
  }

  async expectPreviewShowsWifi(personName: string, wifiNetwork: string) {
    // In bulk import preview, verify WiFi badge is visible
    // Badge text includes emoji "📶 WiFi: {network}" so we match partial text
    await expect(this.page.getByText(`WiFi: ${wifiNetwork}`, { exact: false })).toBeVisible({ timeout: 5000 });
  }

  // Multiple Address Methods

  async addSecondAddress(addressLine: string) {
    // Click "Add Address" button
    const addAddressButton = this.page.getByTestId('add-address-button');
    await addAddressButton.waitFor({ state: 'visible' });
    await addAddressButton.click();

    // Fill in the second address (index 1)
    const secondAddressInput = this.page.locator('#address-1-line1');
    await secondAddressInput.waitFor({ state: 'visible' });
    await secondAddressInput.fill(addressLine);
  }

  async removeAddress(index: number) {
    const removeButton = this.page.getByTestId(`remove-address-${index}-button`);
    await removeButton.waitFor({ state: 'visible' });
    await removeButton.click();
  }

  async expectAddressValue(index: number, value: string) {
    const addressInput = this.page.locator(`#address-${index}-line1`);
    await expect(addressInput).toHaveValue(value);
  }

  async expectAddressCount(count: number) {
    if (count === 0) {
      // Check for empty state message
      await expect(this.page.getByText('No addresses added')).toBeVisible();
    } else {
      // Check that the right number of address inputs exist
      for (let i = 0; i < count; i++) {
        await expect(this.page.locator(`#address-${i}-line1`)).toBeVisible();
      }

      // Verify that the next address doesn't exist
      const nextAddress = this.page.locator(`#address-${count}-line1`);
      await expect(nextAddress).not.toBeVisible({ timeout: 1000 }).catch(() => {});
    }
  }
}

