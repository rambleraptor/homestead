/**
 * Health Page Object Model — vaccine series cards with expandable dose
 * histories.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export interface VaccineFormInput {
  name: string;
  next_due?: string;
  notes?: string;
}

export interface VaccinationFormInput {
  date_administered: string;
  dose?: string;
  provider?: string;
  lot_number?: string;
  notes?: string;
}

export class HealthPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/health-records');
  }

  async expectToBeOnHealthPage() {
    await this.driver.expectURL(/\/health-records/);
  }

  private vaccineCard(name: string) {
    return this.driver.getByTestId('vaccine-card').filter({ hasText: name }).first();
  }

  // --- vaccine (series) ----------------------------------------------------

  async clickAddVaccine() {
    const addButton = this.driver.getByTestId('add-vaccine-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  async fillVaccineForm(data: Partial<VaccineFormInput>) {
    if (data.name !== undefined) {
      await this.driver.locator('#name').fill(data.name);
    }
    if (data.next_due !== undefined) {
      await this.driver.locator('#next_due').fill(data.next_due);
    }
    if (data.notes !== undefined) {
      await this.driver.locator('#vaccine_notes').fill(data.notes);
    }
  }

  async submitVaccineForm() {
    const submitButton = this.driver.getByTestId('vaccine-form-submit');
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();
    // The form view swaps back to the list once the mutation lands.
    await submitButton.waitFor({ state: 'hidden' });
  }

  async createVaccine(data: VaccineFormInput) {
    await this.clickAddVaccine();
    await this.fillVaccineForm(data);
    await this.submitVaccineForm();
    await this.driver.waitForNetworkIdle();
  }

  async editVaccine(name: string, newData: Partial<VaccineFormInput>) {
    const editButton = this.driver.getByRole('button', { name: `Edit ${name}` }).first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    await this.driver.locator('#name').waitFor({ state: 'visible' });
    await this.fillVaccineForm(newData);
    await this.submitVaccineForm();
    await this.driver.waitForNetworkIdle();
  }

  async deleteVaccine(name: string) {
    const deleteButton = this.driver.getByRole('button', { name: `Delete ${name}` }).first();
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();

    // The confirm dialog's destructive action.
    const confirmButton = this.driver.getByRole('button', { name: /^delete$/i }).last();
    await confirmButton.waitFor({ state: 'visible' });
    await confirmButton.click();
    await this.driver.waitForNetworkIdle();
  }

  async expectVaccineInList(name: string) {
    await this.expect(this.vaccineCard(name)).toBeVisible();
  }

  async expectVaccineNotInList(name: string) {
    await this.expect(
      this.driver.getByTestId('vaccine-card').filter({ hasText: name }),
    ).toHaveCount(0);
  }

  async expectEmptyState() {
    await this.expect(this.driver.getByTestId('vaccines-empty')).toBeVisible();
  }

  async expectDueSoonStrip(name: string) {
    await this.expect(
      this.driver.getByTestId('vaccines-due-soon').filter({ hasText: name }),
    ).toBeVisible();
  }

  // --- vaccination (dose) --------------------------------------------------

  async expandVaccine(name: string) {
    await this.vaccineCard(name)
      .getByRole('button', { name: `Expand ${name} history` })
      .click();
  }

  async clickAddDose(name: string) {
    const addButton = this.vaccineCard(name).getByRole('button', {
      name: `Add ${name} dose`,
    });
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  async fillDoseForm(data: Partial<VaccinationFormInput>) {
    if (data.date_administered !== undefined) {
      await this.driver.locator('#date_administered').fill(data.date_administered);
    }
    if (data.dose !== undefined) {
      await this.driver.locator('#dose').fill(data.dose);
    }
    if (data.provider !== undefined) {
      await this.driver.locator('#provider').fill(data.provider);
    }
    if (data.lot_number !== undefined) {
      await this.driver.locator('#lot_number').fill(data.lot_number);
    }
    if (data.notes !== undefined) {
      await this.driver.locator('#notes').fill(data.notes);
    }
  }

  async submitDoseForm() {
    const submitButton = this.driver.getByTestId('vaccination-form-submit');
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();
    await submitButton.waitFor({ state: 'hidden' });
  }

  /** Create a dose through the UI. Lands back on the list with the series
   *  expanded, so the new dose is visible. */
  async createDose(vaccineName: string, data: VaccinationFormInput) {
    await this.clickAddDose(vaccineName);
    await this.fillDoseForm(data);
    await this.submitDoseForm();
    await this.driver.waitForNetworkIdle();
  }

  async editDose(dateAdministered: string, newData: Partial<VaccinationFormInput>) {
    const editButton = this.driver
      .getByRole('button', { name: `Edit dose from ${dateAdministered}` })
      .first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    await this.driver.locator('#date_administered').waitFor({ state: 'visible' });
    await this.fillDoseForm(newData);
    await this.submitDoseForm();
    await this.driver.waitForNetworkIdle();
  }

  async deleteDose(dateAdministered: string) {
    const deleteButton = this.driver
      .getByRole('button', { name: `Delete dose from ${dateAdministered}` })
      .first();
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();

    const confirmButton = this.driver.getByRole('button', { name: /^delete$/i }).last();
    await confirmButton.waitFor({ state: 'visible' });
    await confirmButton.click();
    await this.driver.waitForNetworkIdle();
  }

  async expectDoseInHistory(vaccineName: string, text: string) {
    await this.expect(
      this.vaccineCard(vaccineName)
        .getByTestId('vaccination-card')
        .filter({ hasText: text })
        .first(),
    ).toBeVisible();
  }

  async expectDoseCount(vaccineName: string, count: number) {
    await this.expect(
      this.vaccineCard(vaccineName).getByTestId('vaccination-card'),
    ).toHaveCount(count);
  }
}
