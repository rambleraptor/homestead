/**
 * Households Page Object Model (`/people/households`).
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export interface HouseholdInput {
  name?: string;
  address?: string;
  wifiNetwork?: string;
  wifiPassword?: string;
  addMembers?: Array<{ id: string; name: string }>;
  removeMembers?: Array<{ id: string }>;
}

export class HouseholdsPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/people/households');
    await this.driver.getByTestId('add-household-button').waitFor({ state: 'visible' });
  }

  /** Follow the Households button from the People page. */
  async openFromPeople() {
    await this.driver.getByTestId('households-link').click();
    await this.driver.getByTestId('add-household-button').waitFor({ state: 'visible' });
  }

  async createHousehold(data: HouseholdInput) {
    await this.driver.getByTestId('add-household-button').click();
    await this.fillAndSubmit(data);
  }

  async editHousehold(name: string, data: HouseholdInput) {
    await this.driver.getByRole('button', { name: `Edit ${name}` }).click();
    await this.fillAndSubmit(data);
  }

  async deleteHousehold(name: string) {
    await this.driver.getByRole('button', { name: `Delete ${name}` }).click();
    await this.driver.getByRole('button', { name: 'Delete', exact: true }).click();
    await this.driver.waitForNetworkIdle();
  }

  private async fillAndSubmit(data: HouseholdInput) {
    await this.driver.getByTestId('household-form').waitFor({ state: 'visible' });
    if (data.name !== undefined) await this.driver.locator('#household-name').fill(data.name);
    for (const member of data.removeMembers ?? []) {
      await this.driver.getByTestId(`household-members-remove-${member.id}`).click();
    }
    for (const member of data.addMembers ?? []) {
      const input = this.driver.getByTestId('household-members-input');
      await input.click();
      await input.fill(member.name);
      await this.driver.getByTestId(`household-members-option-${member.id}`).click();
    }
    if (data.address !== undefined) {
      await this.driver.locator('#household-line1').fill(data.address);
    }
    if (data.wifiNetwork !== undefined) {
      await this.driver.locator('#household-wifi-network').fill(data.wifiNetwork);
    }
    if (data.wifiPassword !== undefined) {
      await this.driver.locator('#household-wifi-password').fill(data.wifiPassword);
    }
    const submit = this.driver.getByTestId('household-form-submit');
    await submit.click();
    await submit.waitFor({ state: 'hidden' });
    await this.driver.waitForNetworkIdle();
  }

  /** The household card shows this text (address, WiFi or a member's name). */
  async expectHouseholdShows(household: { id: string }, text: string) {
    await this.expect(this.driver.getByTestId(`household-${household.id}`)).toContainText(text);
  }

  async expectHouseholdNamed(name: string) {
    await this.expect(this.driver.getByRole('heading', { name, level: 3 })).toBeVisible();
  }

  async expectNoHouseholdNamed(name: string) {
    await this.expect(this.driver.getByRole('heading', { name, level: 3 })).toHaveCount(0);
  }

  async expectEmpty() {
    await this.expect(this.driver.getByTestId('households-empty')).toBeVisible();
  }
}
