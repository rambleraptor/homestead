/**
 * Home devices, on the VM tier — the Devices section and the low-battery
 * reminder loop.
 *
 * A port of the Playwright home-devices spec. Each test boots from a fresh
 * database, so the household-wide `device-info` collection starts empty and
 * there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { HomePage } from '../e2e/HomePage';
import { createDevice, getDevice, listChargeTodos, reportDevice } from '../e2e/helpers';

describe('Home devices', () => {
  let h: Harness;
  let homePage: HomePage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    homePage = new HomePage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('shows the empty state before any device reports', async () => {
    await homePage.goto();
    await homePage.expectNoDevices();
  });

  test('lists a reporting device with its charge', async () => {
    await createDevice(userToken, 'fridge-panel', { name: 'Fridge panel', battery_percent: 64 });

    await homePage.goto();

    await homePage.expectDeviceInList('Fridge panel');
    await homePage.expectBattery('Fridge panel', '64%');
  });

  test('changes a device threshold', async () => {
    await createDevice(userToken, 'fridge-panel', { name: 'Fridge panel', battery_percent: 64 });

    await homePage.goto();
    await homePage.setThreshold('Fridge panel', 30);

    await expect
      .poll(async () => (await getDevice(userToken, 'fridge-panel')).low_threshold)
      .toBe(30);
  });

  test('forgets a device', async () => {
    await createDevice(userToken, 'fridge-panel', { name: 'Fridge panel', battery_percent: 64 });

    await homePage.goto();
    await homePage.forgetDevice('Fridge panel');

    await homePage.expectDeviceNotInList('Fridge panel');
  });

  test('a low battery raises one charge todo, closed again on recharge', async () => {
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
