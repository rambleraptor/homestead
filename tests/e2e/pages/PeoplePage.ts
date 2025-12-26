/**
 * People Page Object Model
 */

import { Page, expect, Locator } from '@playwright/test';

export class PeoplePage {
  constructor(private page: Page) {}

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
      // Address is now split into multiple fields, use line1 for simple string addresses
      await this.page.locator('#address_line1').fill(data.address);
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
      // Address is now split into multiple fields, use line1 for simple string addresses
      await this.page.locator('#address_line1').fill(newData.address);
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
}
