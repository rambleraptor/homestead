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

  async expectOnHealthHome() {
    await this.driver.expectURL(/\/health-records$/);
  }

  // --- the forms' own addresses ------------------------------------------

  async gotoNewVaccine() {
    await this.driver.goto('/health-records/vaccines/new');
  }

  async gotoEditVaccine(id: string) {
    await this.driver.goto(`/health-records/vaccines/${id}/edit`);
  }

  async gotoNewDose(vaccineId: string) {
    await this.driver.goto(`/health-records/vaccines/${vaccineId}/doses/new`);
  }

  async gotoEditDose(vaccineId: string, doseId: string) {
    await this.driver.goto(`/health-records/vaccines/${vaccineId}/doses/${doseId}/edit`);
  }

  async expectOnNewVaccinePage() {
    await this.driver.expectURL(/\/health-records\/vaccines\/new$/);
    await this.expect(this.driver.getByTestId('vaccine-form-page')).toBeVisible();
    await this.expect(this.driver.locator('#name')).toBeVisible();
  }

  async expectOnEditVaccinePage(id: string) {
    await this.driver.expectURL(new RegExp(`/health-records/vaccines/${id}/edit$`));
    await this.expect(this.driver.getByTestId('vaccine-form-page')).toBeVisible();
    await this.expect(this.driver.locator('#name')).toBeVisible();
  }

  async expectOnNewDosePage(vaccineId: string) {
    await this.driver.expectURL(new RegExp(`/health-records/vaccines/${vaccineId}/doses/new$`));
    await this.expect(this.driver.getByTestId('dose-form-page')).toBeVisible();
    await this.expect(this.driver.locator('#date_administered')).toBeVisible();
  }

  async expectOnEditDosePage(vaccineId: string, doseId: string) {
    await this.driver.expectURL(
      new RegExp(`/health-records/vaccines/${vaccineId}/doses/${doseId}/edit$`),
    );
    await this.expect(this.driver.getByTestId('dose-form-page')).toBeVisible();
    await this.expect(this.driver.locator('#date_administered')).toBeVisible();
  }

  async expectVaccineNameInput(value: string) {
    await this.expect(this.driver.locator('#name')).toHaveValue(value);
  }

  async expectDoseDateInput(value: string) {
    await this.expect(this.driver.locator('#date_administered')).toHaveValue(value);
  }

  /** The form page for a record the viewer can't load (someone else's, say). */
  async expectFormLoadError(noun: 'vaccine' | 'dose') {
    await this.expect(this.driver.getByText(`Failed to load ${noun}`)).toBeVisible();
    await this.expect(this.driver.getByTestId('vaccine-form')).toHaveCount(0);
    await this.expect(this.driver.getByTestId('vaccination-form')).toHaveCount(0);
  }

  async cancelVaccineForm() {
    await this.driver.getByTestId('vaccine-form-cancel').click();
  }

  async cancelDoseForm() {
    await this.driver.getByTestId('vaccination-form-cancel').click();
  }

  /** The celebration toast a dose can earn (series complete, overdue cleared). */
  get celebration() {
    return this.driver.getByTestId('celebration-toast');
  }

  async expectCelebration(text: string | RegExp) {
    await this.expect(this.celebration).toContainText(text);
  }

  async expectNoCelebration() {
    await this.expect(this.celebration).toHaveCount(0);
  }

  async expectDueBadge(vaccineName: string, label: string) {
    await this.expect(this.vaccineCard(vaccineName).getByTestId('vaccine-due-badge')).toHaveText(
      label,
    );
  }

  async expectNoDueBadge(vaccineName: string) {
    await this.expect(this.vaccineCard(vaccineName).getByTestId('vaccine-due-badge')).toHaveCount(
      0,
    );
  }

  async expectVaccineExpanded(vaccineName: string, expanded: boolean) {
    await this.expect(
      this.vaccineCard(vaccineName).getByTestId('vaccine-dose-history'),
    ).toHaveCount(expanded ? 1 : 0);
  }

  private vaccineCard(name: string) {
    return this.driver.getByTestId('vaccine-card').filter({ hasText: name }).first();
  }

  // --- vaccine (series) ----------------------------------------------------

  /** "Add Vaccine" on the home — a link to `vaccines/new`. */
  async clickAddVaccine() {
    const addButton = this.driver.getByTestId('add-vaccine-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
    await this.driver.locator('#name').waitFor({ state: 'visible' });
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
    // The form page returns to the home once the mutation lands.
    await submitButton.waitFor({ state: 'hidden' });
  }

  async createVaccine(data: VaccineFormInput) {
    await this.clickAddVaccine();
    await this.fillVaccineForm(data);
    await this.submitVaccineForm();
    await this.driver.waitForNetworkIdle();
  }

  /** The pencil on a series card — a link to `vaccines/:id/edit`. */
  async clickEditVaccine(name: string) {
    const editLink = this.driver.getByRole('link', { name: `Edit ${name}` }).first();
    await editLink.waitFor({ state: 'visible' });
    await editLink.click();
  }

  async editVaccine(name: string, newData: Partial<VaccineFormInput>) {
    await this.clickEditVaccine(name);

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

  /** "+ Dose" on a series card — a link to `vaccines/:id/doses/new`. */
  async clickAddDose(name: string) {
    const addLink = this.vaccineCard(name).getByRole('link', {
      name: `Add ${name} dose`,
    });
    await addLink.waitFor({ state: 'visible' });
    await addLink.click();
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

  /** The pencil on a dose — a link to `vaccines/:id/doses/:doseId/edit`. */
  async clickEditDose(dateAdministered: string) {
    const editLink = this.driver
      .getByRole('link', { name: `Edit dose from ${dateAdministered}` })
      .first();
    await editLink.waitFor({ state: 'visible' });
    await editLink.click();
  }

  async editDose(dateAdministered: string, newData: Partial<VaccinationFormInput>) {
    await this.clickEditDose(dateAdministered);

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
