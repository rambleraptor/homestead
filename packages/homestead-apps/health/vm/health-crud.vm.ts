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

  test('surfaces an overdue series in the due-soon strip', async () => {
    await createVaccine(userToken, {
      name: 'Hepatitis B',
      next_due: '2021-01-15', // long past — always overdue
    });

    await healthPage.goto();
    await healthPage.expectDueSoonStrip('Hepatitis B');
  });
});
