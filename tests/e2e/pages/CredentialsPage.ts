/**
 * Credentials Page Object Model.
 *
 * Covers the superuser-only Credentials app (`/superuser/credentials`): list,
 * add, replace and delete the secrets Homestead uses. Values are write-only, so
 * the page shows each one as "Set · …hint · date", never the value.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class CredentialsPage {
  constructor(readonly driver: Driver) {}

  async goto() {
    await this.driver.goto('/superuser/credentials');
  }

  get addButton(): Locator {
    return this.driver.getByTestId('add-credential-button');
  }

  get list(): Locator {
    return this.driver.getByTestId('credentials-list');
  }

  get emptyState(): Locator {
    return this.driver.getByTestId('credentials-empty');
  }

  get noKeyBanner(): Locator {
    return this.driver.getByTestId('credentials-no-key');
  }

  /** A credential's card, by id. */
  credential(id: string): Locator {
    return this.driver.getByTestId(`credential-${id}`);
  }

  /** The "Set · …hint · date" line for a credential. */
  valueSummary(id: string): Locator {
    return this.driver.getByTestId(`credential-value-${id}`);
  }

  /** Open the add form and save a new credential. */
  async add(name: string, value: string, description?: string) {
    await this.addButton.click();
    await this.driver.getByTestId('credential-name').fill(name);
    if (description) await this.driver.getByTestId('credential-description').fill(description);
    await this.driver.getByTestId('credential-value').fill(value);
    await this.driver.getByTestId('credential-form-submit').click();
    await this.driver.getByTestId('credential-form').waitFor({ state: 'hidden' });
  }

  /** Replace a credential's value from its edit form. */
  async replaceValue(id: string, value: string) {
    await this.driver.getByTestId(`edit-credential-${id}`).click();
    await this.driver.getByTestId('credential-value-replace').click();
    await this.driver.getByTestId('credential-value').fill(value);
    await this.driver.getByTestId('credential-form-submit').click();
    await this.driver.getByTestId('credential-form').waitFor({ state: 'hidden' });
  }

  /** Rename a credential without touching its value. */
  async rename(id: string, name: string) {
    await this.driver.getByTestId(`edit-credential-${id}`).click();
    await this.driver.getByTestId('credential-name').fill(name);
    await this.driver.getByTestId('credential-form-submit').click();
    await this.driver.getByTestId('credential-form').waitFor({ state: 'hidden' });
  }

  async delete(id: string) {
    await this.driver.getByTestId(`delete-credential-${id}`).click();
    await this.driver.getByRole('button', { name: 'Delete', exact: true }).click();
    await this.credential(id).waitFor({ state: 'hidden' });
  }
}
