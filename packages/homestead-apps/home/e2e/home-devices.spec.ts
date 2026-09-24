/**
 * Home E2E Tests — the Devices section and the low-battery reminder loop.
 *
 * `device-info` is household-wide, so each test clears the whole collection
 * (and any charge todos) in `beforeEach` rather than relying on per-user scoping.
 */

import { test, expect } from '../../../../tests/e2e/fixtures/aepbase.fixture';
import { HomePage } from './HomePage';
import {
  createDevice,
  deleteAllDevices,
  getDevice,
  listChargeTodos,
  reportDevice,
} from './helpers';

test.describe('Home devices', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    homePage = new HomePage(authenticatedPage);
    await deleteAllDevices(userToken);
  });

  test('shows the empty state before any device reports', async () => {
    await homePage.goto();
    await homePage.expectNoDevices();
  });

  test('lists a reporting device with its charge', async ({ userToken }) => {
    await createDevice(userToken, 'fridge-panel', { name: 'Fridge panel', battery_percent: 64 });

    await homePage.goto();

    await homePage.expectDeviceInList('Fridge panel');
    await homePage.expectBattery('Fridge panel', '64%');
  });

  test('changes a device threshold', async ({ userToken }) => {
    await createDevice(userToken, 'fridge-panel', { name: 'Fridge panel', battery_percent: 64 });

    await homePage.goto();
    await homePage.setThreshold('Fridge panel', 30);

    await expect
      .poll(async () => (await getDevice(userToken, 'fridge-panel')).low_threshold)
      .toBe(30);
  });

  test('forgets a device', async ({ userToken }) => {
    await createDevice(userToken, 'fridge-panel', { name: 'Fridge panel', battery_percent: 64 });

    await homePage.goto();
    await homePage.forgetDevice('Fridge panel');

    await homePage.expectDeviceNotInList('Fridge panel');
  });

  test('a low battery raises one charge todo, closed again on recharge', async ({
    userToken,
  }) => {
    await createDevice(userToken, 'fridge-panel', { name: 'Fridge panel', battery_percent: 50 });
    await reportDevice(userToken, 'fridge-panel', { battery_percent: 15 });

    await expect
      .poll(async () => (await listChargeTodos(userToken)).map((t) => t.status))
      .toEqual(['pending']);
    await expect
      .poll(async () => (await getDevice(userToken, 'fridge-panel')).low_battery_alerted)
      .toBe(true);

    // A later low report doesn't pile on a second todo.
    await reportDevice(userToken, 'fridge-panel', { battery_percent: 14 });
    await reportDevice(userToken, 'fridge-panel', { battery_percent: 90 });

    await expect
      .poll(async () => (await getDevice(userToken, 'fridge-panel')).low_battery_alerted)
      .toBe(false);
    const todos = await listChargeTodos(userToken);
    expect(todos).toHaveLength(1);
    expect(todos[0]!.status).toBe('completed');
  });
});
