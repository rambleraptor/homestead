/**
 * User Settings — app-declared per-user settings, on the VM tier.
 *
 * A port of tests/e2e/tests/settings/user-settings.spec.ts. The People app
 * declares a `map_provider` user-setting; the Settings page renders it via the
 * auto-generated form. Verify the value round-trips: changing the select
 * persists across reloads.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { SettingsPage } from '../e2e/pages/SettingsPage';

describe('User Settings — map provider', () => {
  let h: Harness;
  let settingsPage: SettingsPage;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.member);
    settingsPage = new SettingsPage(h.driver);
    await settingsPage.goto();
  });

  afterEach(async () => {
    await h.close();
  });

  test('persists per-user map provider across reloads', async () => {
    // The App Settings section is rendered when at least one
    // app declares userSettings or a settingsWidget. People +
    // Events both qualify, so this list should always be present.
    await h.driver.expect(h.driver.getByTestId('app-user-settings-list')).toBeVisible();

    // Default starts as the declared default.
    await settingsPage.expectMapProvider('google');

    await settingsPage.selectMapProvider('apple');
    // Reload and confirm the choice stuck. (The Playwright spec retries the
    // reload+check because the hydrating fetch can transiently fail under
    // full-suite load; in-process there is no such load, so one reload.)
    await h.driver.reload();
    await settingsPage.expectMapProvider('apple');
  });
});
