/**
 * Health CRUD (vaccine series + doses), on the VM tier.
 *
 * A port of the Playwright spec that lived at ../e2e/health-crud.spec.ts: same
 * page object and seed helpers, run in happy-dom against the server's
 * in-process fetch handler. Each test boots from a fresh database, so there is
 * no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { HealthPage } from '../e2e/HealthPage';
import {
  createVaccination,
  createVaccine,
  getVaccination,
  getVaccine,
  listVaccinations,
  testVaccinations,
  testVaccines,
} from '../e2e/helpers';

describe('Health CRUD', () => {
  let h: Harness;
  let healthPage: HealthPage;
  let userToken: string;

  // Seeding happens BEFORE the per-test navigation: each test navigates after
  // its API setup, so the UI renders the seeded state without a reload.
  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    healthPage = new HealthPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('shows the empty state with no vaccines', async () => {
    await healthPage.goto();
    await healthPage.expectEmptyState();
  });

  test('creates a vaccine series', async () => {
    await healthPage.goto();
    await healthPage.createVaccine(testVaccines[1]);

    await healthPage.expectVaccineInList(testVaccines[1].name);
  });

  test('creates multiple vaccine series', async () => {
    await healthPage.goto();
    for (const vaccine of testVaccines) {
      await healthPage.createVaccine(vaccine);
    }

    for (const vaccine of testVaccines) {
      await healthPage.expectVaccineInList(vaccine.name);
    }
  });

  test('adds a dose under a vaccine', async () => {
    const vaccine = await createVaccine(userToken, testVaccines[1]);

    await healthPage.goto();
    await healthPage.createDose(vaccine.name, testVaccinations[0]);

    // The list re-opens with the series expanded and the dose visible.
    await healthPage.expectDoseCount(vaccine.name, 1);

    const doses = await listVaccinations(userToken, vaccine.id);
    expect(doses).toHaveLength(1);
    expect(doses[0].provider).toBe(testVaccinations[0].provider);
  });

  test('edits a vaccine series', async () => {
    const vaccine = await createVaccine(userToken, { name: 'Hepatitis B' });

    await healthPage.goto();
    await healthPage.expectVaccineInList('Hepatitis B');

    await healthPage.editVaccine('Hepatitis B', { next_due: '2030-01-01' });

    const updated = await getVaccine(userToken, vaccine.id);
    expect(updated.next_due).toBe('2030-01-01');
  });

  test('edits a dose', async () => {
    const vaccine = await createVaccine(userToken, testVaccines[0]);
    const dose = await createVaccination(userToken, vaccine.id, testVaccinations[0]);

    await healthPage.goto();
    await healthPage.expandVaccine(vaccine.name);
    await healthPage.editDose(dose.date_administered, {
      provider: 'Kaiser',
      dose: '2 of 2',
    });

    const updated = await getVaccination(userToken, vaccine.id, dose.id);
    expect(updated.provider).toBe('Kaiser');
    expect(updated.dose).toBe('2 of 2');
  });

  test('deletes a dose', async () => {
    const vaccine = await createVaccine(userToken, testVaccines[0]);
    const dose = await createVaccination(userToken, vaccine.id, testVaccinations[0]);

    await healthPage.goto();
    await healthPage.expandVaccine(vaccine.name);
    await healthPage.deleteDose(dose.date_administered);

    await healthPage.expectDoseCount(vaccine.name, 0);
    expect(await listVaccinations(userToken, vaccine.id)).toHaveLength(0);
  });

  test('deletes a vaccine and cascades its doses', async () => {
    const vaccine = await createVaccine(userToken, testVaccines[0]);
    await createVaccination(userToken, vaccine.id, testVaccinations[0]);

    await healthPage.goto();
    await healthPage.expectVaccineInList(vaccine.name);

    await healthPage.deleteVaccine(vaccine.name);

    await healthPage.expectVaccineNotInList(vaccine.name);
  });

  test('"Add Vaccine" opens vaccines/new; saving and cancel return home', async () => {
    await healthPage.goto();
    await healthPage.clickAddVaccine();
    await healthPage.expectOnNewVaccinePage();

    await healthPage.fillVaccineForm({ name: 'Hepatitis A' });
    await healthPage.submitVaccineForm();

    await healthPage.expectOnHealthHome();
    await healthPage.expectVaccineInList('Hepatitis A');

    await healthPage.gotoNewVaccine();
    await healthPage.expectOnNewVaccinePage();
    await healthPage.fillVaccineForm({ name: 'Never saved' });
    await healthPage.cancelVaccineForm();

    await healthPage.expectOnHealthHome();
    await healthPage.expectVaccineNotInList('Never saved');
  });

  test('the series pencil opens vaccines/:id/edit; a reload keeps the form', async () => {
    const vaccine = await createVaccine(userToken, { name: 'Hepatitis B' });

    await healthPage.goto();
    await healthPage.clickEditVaccine('Hepatitis B');
    await healthPage.expectOnEditVaccinePage(vaccine.id);
    await healthPage.expectVaccineNameInput('Hepatitis B');

    await h.driver.reload();

    await healthPage.expectOnEditVaccinePage(vaccine.id);
    await healthPage.expectVaccineNameInput('Hepatitis B');
  });

  test('"+ Dose" opens vaccines/:id/doses/new; saving returns home with the series open', async () => {
    const vaccine = await createVaccine(userToken, testVaccines[1]);

    await healthPage.goto();
    await healthPage.clickAddDose(vaccine.name);
    await healthPage.expectOnNewDosePage(vaccine.id);

    await healthPage.fillDoseForm(testVaccinations[0]);
    await healthPage.submitDoseForm();

    await healthPage.expectOnHealthHome();
    await healthPage.expectVaccineExpanded(vaccine.name, true);
    await healthPage.expectDoseInHistory(vaccine.name, testVaccinations[0].provider!);
  });

  test('a dose pencil opens its edit address; a reload keeps the form', async () => {
    const vaccine = await createVaccine(userToken, testVaccines[0]);
    const dose = await createVaccination(userToken, vaccine.id, testVaccinations[0]);

    await healthPage.goto();
    await healthPage.expandVaccine(vaccine.name);
    await healthPage.clickEditDose(dose.date_administered);
    await healthPage.expectOnEditDosePage(vaccine.id, dose.id);
    await healthPage.expectDoseDateInput(dose.date_administered);

    await h.driver.reload();

    await healthPage.expectOnEditDosePage(vaccine.id, dose.id);
    await healthPage.expectDoseDateInput(dose.date_administered);

    await healthPage.cancelDoseForm();
    await healthPage.expectOnHealthHome();
    await healthPage.expectVaccineExpanded(vaccine.name, true);
  });

  test("another user's vaccine address loads nothing", async () => {
    // The admin's series: the member's scoped read can't see it.
    const theirs = await createVaccine(h.admin.token, { name: 'Not Yours' });

    await healthPage.gotoEditVaccine(theirs.id);
    await healthPage.expectFormLoadError('vaccine');

    await healthPage.gotoNewDose(theirs.id);
    await healthPage.expectFormLoadError('vaccine');
  });

  test('the dose that completes a series is celebrated, once', async () => {
    const vaccine = await createVaccine(userToken, { name: 'Shingrix' });
    await createVaccination(userToken, vaccine.id, {
      date_administered: '2026-01-10',
      dose: '1 of 2',
    });

    await healthPage.goto();
    await healthPage.createDose(vaccine.name, {
      date_administered: '2026-03-15',
      dose: '2 of 2',
    });

    await healthPage.expectCelebration('Series complete');
    await healthPage.expectCelebration('Shingrix');
    await healthPage.expectDoseCount(vaccine.name, 2);
    await h.driver.expect(healthPage.celebration).toHaveCount(1);
  });

  test('a dose that clears an overdue series is celebrated and drops the badge', async () => {
    const vaccine = await createVaccine(userToken, {
      name: 'Hepatitis B',
      next_due: '2021-01-15', // long past — always overdue
    });

    await healthPage.goto();
    await healthPage.expectDueBadge('Hepatitis B', 'Overdue');
    await healthPage.expectDueSoonStrip('Hepatitis B');

    await healthPage.createDose(vaccine.name, {
      date_administered: '2021-02-01',
      dose: 'booster',
    });

    await healthPage.expectCelebration('Caught up on Hepatitis B');
    await healthPage.expectNoDueBadge('Hepatitis B');
    await h.driver.expect(h.driver.getByTestId('vaccines-due-soon')).toHaveCount(0);
  });

  test('an ordinary dose is not celebrated', async () => {
    const vaccine = await createVaccine(userToken, testVaccines[1]);

    await healthPage.goto();
    await healthPage.createDose(vaccine.name, testVaccinations[0]);

    await healthPage.expectDoseCount(vaccine.name, 1);
    await healthPage.expectNoCelebration();
  });

  test('surfaces an overdue series in the due-soon strip', async () => {
    await createVaccine(userToken, {
      name: 'Hepatitis B',
      next_due: '2021-01-15', // long past — always overdue
    });

    await healthPage.goto();
    await healthPage.expectDueSoonStrip('Hepatitis B');
  });
});
