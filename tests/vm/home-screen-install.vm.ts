/**
 * Adding apps to the Home Screen from All apps, on the VM tier.
 *
 * Each app with its own Home Screen icon gets an "Add" button on the drawer.
 * The button leaves the page (for the browser, or Safari), which the VM can't
 * follow — that hand-off is covered by the component's unit tests — so these
 * check the two ends: the drawer lists the right apps, and an app's page
 * opened with `?install` shows the guide for that app and drops the
 * parameter from the address.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { AppDrawerPage } from '../e2e/pages/AppDrawerPage';

describe('Add to Home Screen', () => {
  let h: Harness;
  let drawer: AppDrawerPage;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.member);
    drawer = new AppDrawerPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('All apps offers each app with its own icon', async () => {
    await drawer.goto();
    await h.driver.expect(drawer.homeScreenSection).toBeVisible();
    await h.driver.expect(drawer.homeScreenAdd('notes')).toBeVisible();
    await h.driver.expect(drawer.homeScreenAdd('todos')).toBeVisible();
  });

  test("an app's page opened to install shows that app's guide", async () => {
    await h.driver.goto('/notes?install');
    await h.driver.expect(drawer.installGuide).toBeVisible();
    await h.driver.expect(drawer.installGuide).toContainText('Add Notes to your Home Screen');
    await h.driver.expectURL(/\/notes$/);
  });
});
