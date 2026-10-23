# Homestead End-to-End Tests

End-to-end tests for Homestead using Playwright against a real backend.

> **Most UI flows run on the VM tier instead** — the real SPA in happy-dom
> against the in-process server (`make test-vm`, specs in each app's `vm/`
> and in `tests/vm/`; see CLAUDE.md, "VM tests"). This directory still owns
> the shared plumbing both tiers use (page objects in `pages/`, seed helpers
> in `utils/`, the AI stub in `config/`), and Playwright keeps only the flows
> that need a real browser.

## Overview

These tests exercise the Vite + React frontend and the homestead-server
backend together in a real browser, for what the VM tier can't do.

### What's Tested

- **Offline** - the offline banner (`tests/offline/`) and the groceries offline
  queue (`packages/homestead-apps/groceries/e2e/`), via real
  `context.setOffline` and request interception
- **Redaction** - drawing redaction boxes over a real canvas
  (`packages/homestead-apps/documents/e2e/`)

## Architecture

### Directory Structure

```
tests/e2e/                            # Cross-cutting test plumbing
├── config/
│   ├── aepbase.setup.ts              # aepbase test instance management
│   └── dev-server.setup.ts           # Vite dev server bootstrap
├── fixtures/
│   ├── aepbase.fixture.ts            # Auth + user/admin Playwright fixtures
│   └── test-data.ts                  # `testUsers` (cross-cutting only)
├── pages/                            # Core Page Object Models
│   ├── LoginPage.ts
│   ├── DashboardPage.ts
│   ├── SettingsPage.ts
│   ├── UsersPage.ts
│   └── FlagManagementPage.ts
├── tests/                            # Core specs (auth, nav, settings, …)
│   ├── auth/
│   ├── flag-management/
│   ├── navigation/
│   ├── offline/
│   ├── settings/
│   └── users/
├── utils/
│   ├── aepbase-helpers.ts            # e2eClient() + shared seed/cleanup helpers
│   └── test-helpers.ts
├── package.json
├── playwright.config.ts              # Discovers specs under both roots
├── tsconfig.json
└── README.md

packages/homestead-apps/<app>/  # App-owned e2e artifacts
└── e2e/
    ├── <App>Page.ts               # App POM
    ├── helpers.ts                    # Seed helpers + test data
    └── <app>-*.spec.ts            # Specs
```

Playwright `testDir` is the repo root; `testMatch` covers both
`tests/e2e/tests/**/*.spec.ts` and
`packages/homestead-apps/**/e2e/**/*.spec.ts`.

### Test Infrastructure

#### aepbase Test Instance

Each test run:
1. Creates a fresh aepbase instance on port 8092
2. Applies the declared resource definitions via the shared schema sync
3. Seeds initial data (admin user)
4. Runs tests against this isolated instance
5. Tears down after completion

#### Fixtures

**`userToken`** - Authenticated bearer token for direct aepbase calls, made
through the shared client via `e2eClient(token)`

```typescript
test('example', async ({ userToken }) => {
  await e2eClient(userToken).collection('gift-cards').create({ ... });
});
```

**`testUser`** - A created test user with credentials

```typescript
test('example', async ({ testUser }) => {
  // testUser.email, testUser.password, testUser.id
});
```

**`authenticatedPage`** - A browser page with logged-in user

```typescript
test('example', async ({ authenticatedPage }) => {
  await authenticatedPage.goto('/gift-cards');
  // Already authenticated
});
```

## Running Tests

### Prerequisites

1. **Install Dependencies**

```bash
cd tests/e2e
npm install
```

2. **Install Playwright Browsers**

```bash
npx playwright install chromium
```

3. **Ensure Frontend Dev Server is Available**

The tests expect the frontend to be running at `http://localhost:5173`. The Playwright config will start it automatically, but you can also run it manually:

```bash
cd frontend
npm run dev
```

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

Pass a path (relative to the repo root, which is Playwright's `testDir`):

```bash
npm test -- tests/e2e/tests/offline/
npm test -- packages/homestead-apps/groceries/e2e/
```

### Run in UI Mode (Interactive)

```bash
npm run test:ui
```

This opens a browser where you can:
- See tests execute in real-time
- Inspect each step
- Debug failures
- Re-run specific tests

### Run in Headed Mode (Watch Browser)

```bash
npm run test:headed
```

### Debug Mode

```bash
npm run test:debug
```

Opens the Playwright Inspector for step-by-step debugging.

### View Test Report

```bash
npm run report
```

Opens the HTML report showing test results, screenshots, and videos of failures.

## Writing Tests

### Basic Test Structure

App specs live at `packages/homestead-apps/<app>/e2e/`. The
shared fixture, generic REST helpers, and core POMs live under
`tests/e2e/`, so app specs import them via a relative path.

```typescript
// packages/homestead-apps/gift-cards/e2e/gift-card-crud.spec.ts
import { test, expect } from '../../../../tests/e2e/fixtures/aepbase.fixture';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { GiftCardsPage } from './GiftCardsPage';
import { createGiftCard, deleteAllGiftCards, testGiftCards } from './helpers';

test.describe('Gift Cards CRUD', () => {
  let giftCardsPage: GiftCardsPage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    giftCardsPage = new GiftCardsPage(authenticatedPage);
    await deleteAllGiftCards(userToken);
    await giftCardsPage.goto();
  });

  test('should edit a gift card', async ({ userToken }) => {
    const created = await createGiftCard(userToken, testGiftCards[0]);
    // … exercise the UI …
    const updated = await e2eClient(userToken)
      .collection<{ amount: number }>('gift-cards')
      .get(created.id);
    expect(updated.amount).toBe(75);
  });
});
```

### Using Page Object Models

Page Objects encapsulate page interactions:

```typescript
// Good - Use Page Object
await giftCardsPage.createGiftCard({
  merchant: 'Amazon',
  amount: 50,
});

// Bad - Direct DOM manipulation
await page.getByRole('button', { name: /add/i }).click();
await page.getByLabel(/merchant/i).fill('Amazon');
// ... etc
```

### Seeding data via aepbase REST

For tests that need existing data, import the app's seed helpers
from its colocated `e2e/helpers.ts`:

```typescript
import { createGiftCard, deleteAllGiftCards } from './helpers';

test.beforeEach(async ({ userToken }) => {
  await deleteAllGiftCards(userToken);
});

test('should edit gift card', async ({ userToken }) => {
  await createGiftCard(userToken, { merchant: 'Amazon', amount: 50 });
  await giftCardsPage.editGiftCard('Amazon', { amount: 75 });
});
```

Need direct engine access the app helpers don't expose? Import
`e2eClient` from `../../../../tests/e2e/utils/aepbase-helpers` and use the
client's fluent API (`e2eClient(token).collection('x').get(id)`). For a list
that tolerates a forbidden/absent collection (returning `[]`), use the
`listOrEmpty(token, plural)` helper from the same module.

## Best Practices

### 1. Use Fixtures

✅ **Do:**
```typescript
test('example', async ({ authenticatedPage, userToken }) => {
  // Use provided fixtures
});
```

❌ **Don't:**
```typescript
test('example', async ({ page }) => {
  // Manually login every time
  await page.goto('/login');
  // ...
});
```

### 2. Use Page Objects

✅ **Do:**
```typescript
await giftCardsPage.createGiftCard({ merchant: 'Amazon', amount: 50 });
```

❌ **Don't:**
```typescript
await page.getByRole('button', { name: /add/i }).click();
await page.getByLabel(/merchant/i).fill('Amazon');
```

### 3. Seed Data via API

✅ **Do:**
```typescript
await createMultipleGiftCards(userToken, cards);
await giftCardsPage.goto();
```

❌ **Don't:**
```typescript
for (const card of cards) {
  await giftCardsPage.createGiftCard(card); // Slow UI interaction
}
```

### 4. Test One Thing Per Test

✅ **Do:**
```typescript
test('should create gift card', async () => { ... });
test('should edit gift card', async () => { ... });
```

❌ **Don't:**
```typescript
test('should create, edit, delete gift card', async () => { ... });
```

### 5. Use Descriptive Test Names

✅ **Do:**
```typescript
test('should reject weak password', async () => { ... });
```

❌ **Don't:**
```typescript
test('password test', async () => { ... });
```

## Troubleshooting

### Tests Fail with "Connection Refused"

aepbase failed to start. Check:
- Port 8092 is not in use
- `bun` is installed (homestead-server runs under Bun)
- Schema sync logged no errors during bootstrap

### Tests Timeout

Frontend not running or slow to start. Check:
- `npm run dev` works in `frontend/`
- Port 5173 is accessible
- No build errors

### "Cannot find app" Errors

TypeScript configuration issue:
```bash
npm install
```

### Flaky Tests

Tests sometimes pass, sometimes fail:
- Add explicit waits: `await page.waitForURL(...)`
- Use `waitForLoadState('networkidle')`
- Increase timeout for slow operations

## CI/CD Integration

Tests are designed to run in GitHub Actions. See `.github/workflows/e2e-tests.yml` for the CI configuration.

### Running in CI

```yaml
- name: Run E2E Tests
  run: cd tests/e2e && npm test
```

CI automatically:
- Installs dependencies
- Builds the aepbase binary
- Starts frontend dev server
- Starts the aepbase test instance
- Runs all tests
- Uploads failure artifacts (screenshots, videos, traces)

## Performance

### Test Execution Time

Typical test run times:
- Auth tests: ~10-15 seconds
- Gift cards tests: ~20-30 seconds
- Events tests: ~15-20 seconds
- Settings tests: ~10-15 seconds
- Navigation tests: ~10-15 seconds

**Total: ~2-3 minutes for full suite**

### Optimization Tips

1. **Run tests in parallel** (when safe):
   ```typescript
   test.describe.configure({ mode: 'parallel' });
   ```

2. **Seed data via API** instead of UI interactions

3. **Use specific selectors** to avoid unnecessary retries

4. **Skip browser downloads** for specific tests:
   ```typescript
   test.use({ viewport: null }); // No viewport = faster
   ```

## Contributing

When adding new features:

1. Add tests for critical user flows
2. Use existing page objects or create new ones
3. Follow the established patterns
4. Run tests locally before pushing
5. Ensure tests pass in CI

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Homestead CLAUDE.md](../../CLAUDE.md) - Project guidelines
