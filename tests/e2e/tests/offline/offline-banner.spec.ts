/**
 * Global offline banner — fires on every authenticated page (not just
 * groceries). Visiting a non-groceries route and toggling the network
 * is enough to prove the banner is mounted in `AppShell`, not on a
 * single screen.
 *
 * Note: navigating between pages WHILE offline is not tested. Playwright's
 * `setOffline(true)` cuts off all network including the Next.js dev server,
 * so `page.goto(...)` errors with ERR_INTERNET_DISCONNECTED for any route
 * whose bundle hasn't been pre-fetched. Surviving cold offline navigation
 * would require a service worker that caches the app shell — explicitly
 * out of scope.
 */

import { test, expect } from '../../fixtures/aepbase.fixture';

test.describe('Offline banner', () => {
  test('appears on a non-groceries page when the network drops', async ({
    page,
    context,
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/todos');
    await expect(page.getByTestId('offline-banner')).toBeHidden();

    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toContainText(/offline/i);

    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).toBeHidden();
  });
});
