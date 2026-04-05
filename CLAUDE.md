# Claude AI Assistant Guidelines for HomeOS

This document provides guidelines for Claude AI assistants working on the HomeOS project, as well as general development practices for all contributors.

## Table of Contents

- [Pull Request Requirements](#pull-request-requirements)
- [Development Workflow](#development-workflow)
- [Testing Guidelines](#testing-guidelines)
- [Code Quality Standards](#code-quality-standards)
- [Project Structure](#project-structure)
- [aepbase Backend (migration in progress)](#aepbase-backend-migration-in-progress)

## Pull Request Requirements

**Every PR MUST pass the following checks before being pushed:**

### 1. Build ✅

The application must build successfully without errors.

```bash
# From project root
make build

# Or from frontend directory
cd frontend && npm run build
```

**Why:** Ensures that the code compiles correctly and there are no build-time errors that would prevent deployment.

### 2. Lint ✅

Code must pass ESLint checks with no errors.

```bash
# From project root
make lint

# Or from frontend directory
cd frontend && npm run lint
```

**Why:** Maintains code consistency, catches common errors, and enforces coding standards across the project.

### 3. Type Check ✅

TypeScript must compile without type errors.

```bash
# From project root
make type-check

# Or from frontend directory
cd frontend && npm run type-check
```

**Why:** Catches type-related bugs early and ensures type safety throughout the codebase.

### 4. Tests ✅

All tests must pass.

```bash
# From project root
make test

# Or from frontend directory
cd frontend && npm run test
```

**Why:** Validates that new changes don't break existing functionality and that new features work as expected.

## Development Workflow

### Complete Pre-Push Checklist

Before pushing any PR, run the CI command which combines all essential checks:

```bash
# From project root - runs lint, type-check, build, and tests
make ci && make test
```

This single command ensures your code meets all quality standards.

### Recommended Development Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, modular code
   - Follow the existing architecture patterns
   - Add tests for new functionality

3. **Test locally**
   ```bash
   make ci && make test-all
   ```

4. **Commit with clear messages**
   ```bash
   git commit -m "Add feature: brief description"
   ```

5. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## Testing Guidelines

### Frontend Tests

HomeOS uses Vitest for testing. Tests should cover:

- **Component behavior** - User interactions and rendering
- **Hooks** - Custom hook logic and state management
- **API integration** - PocketBase queries and mutations
- **Business logic** - Utilities and helper functions

```typescript
// Example test structure
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('ComponentName', () => {
  it('should render correctly', () => {
    render(<ComponentName />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### Migration Tests

Located in `tests/migrations/`, these tests:

- Download and run PocketBase 0.34.2
- Apply all migrations from `pb_migrations/`
- Verify PocketBase doesn't crash
- Check that collections are created with correct schema

See `tests/migrations/README.md` for more details.

### End-to-End (E2E) Tests

Located in `tests/e2e/`, these tests verify the full integration of HomeOS:

- **Real browser testing** - Uses Playwright to test in actual browsers
- **PocketBase integration** - Tests against real PocketBase instance
- **Complete user flows** - Authentication, CRUD operations, navigation
- **Comprehensive coverage** - Gift cards, events, settings, and more

```bash
# Run e2e tests
make test-e2e

# Run in UI mode (interactive debugging)
make test-e2e-ui

# Run specific test suite
cd tests/e2e && npm run test:auth
cd tests/e2e && npm run test:gift-cards
```

**What's tested:**
- Authentication (login, logout, session persistence)
- Gift Cards (create, read, update, delete, merchant summaries)
- Events (CRUD, recurring events, date handling)
- Settings (password changes, validation)
- Navigation (routing, 404 handling, module switching)

See `tests/e2e/README.md` for detailed documentation.

#### E2E Testing Best Practices

**CRITICAL: Follow these guidelines when writing or maintaining e2e tests to ensure reliability and maintainability.**

##### 1. Test Isolation

**Each test MUST be completely isolated from other tests:**

```typescript
test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
  // Clean up data for THIS test user before each test
  await deleteAllGiftCards(userPocketbase);
  await deleteAllEvents(userPocketbase);

  // Navigate to the page under test
  await myPage.goto();
});
```

**Why:** Isolation ensures tests can run in any order and don't affect each other.

**Each test gets:**
- A unique test user (created and deleted automatically via `testUser` fixture)
- An authenticated browser page (`authenticatedPage` fixture)
- A PocketBase client authenticated as that user (`userPocketbase` fixture)

**DON'T:**
- ❌ Manually clean up data for other users or merchants
- ❌ Rely on data from previous tests
- ❌ Share state between tests

**DO:**
- ✅ Use `beforeEach` to clean up the current test user's data
- ✅ Create test data via API in `beforeEach` or test setup
- ✅ Trust that each test user is isolated

##### 2. Waiting Strategies

**NEVER use hardcoded timeouts:**

```typescript
// ❌ BAD - Hardcoded timeout
await page.waitForTimeout(500);
await page.waitForTimeout(1000);

// ✅ GOOD - Wait for specific conditions
await submitButton.waitFor({ state: 'visible' });
await submitButton.click();
await submitButton.waitFor({ state: 'hidden' });

// ✅ GOOD - Wait for network to settle
await page.waitForLoadState('networkidle');

// ✅ GOOD - Playwright's auto-waiting
await expect(page.getByText('Success')).toBeVisible();
```

**Why:** Hardcoded timeouts are brittle, slow tests down, and can cause flakiness.

**Best practices:**
- Use Playwright's built-in auto-waiting for actions (click, fill, etc.)
- Use `waitFor({ state })` for explicit waits
- Use `waitForLoadState('networkidle')` after mutations
- Use `expect().toBeVisible()` for assertions (has built-in retry)

##### 3. Selectors

**Use selectors in this priority order:**

1. **`data-testid` attributes** (most stable):
   ```typescript
   // ✅ BEST - Dedicated test ID
   await page.getByTestId('add-gift-card-button').click();
   await page.getByTestId('gift-card-form-submit').click();
   ```

2. **Role-based selectors** (semantic):
   ```typescript
   // ✅ GOOD - Semantic and accessible
   await page.getByRole('button', { name: /add gift card/i }).click();
   await page.getByRole('heading', { name: 'Dashboard' }).isVisible();
   ```

3. **Label-based selectors** (for form fields):
   ```typescript
   // ✅ GOOD - Matches how users interact
   await page.getByLabel(/email/i).fill('user@example.com');
   await page.getByLabel(/password/i).fill('password123');
   ```

4. **Text content** (for verification):
   ```typescript
   // ✅ OK - For checking displayed content
   await expect(page.getByText('Success!')).toBeVisible();
   ```

**AVOID:**
- ❌ CSS class selectors (`.bg-white.rounded-lg.border`)
- ❌ Complex DOM traversal (`locator('..')`)
- ❌ Positional selectors that break when layout changes

**Adding test IDs to components:**

```tsx
// Add to critical UI elements
<button data-testid="add-item-button" onClick={handleAdd}>
  Add Item
</button>

<form data-testid="item-form">
  <button type="submit" data-testid="item-form-submit">
    Submit
  </button>
</form>
```

##### 4. Page Object Model (POM)

**All e2e tests MUST use Page Object Models:**

```typescript
// tests/e2e/pages/MyFeaturePage.ts
export class MyFeaturePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/my-feature');
  }

  async createItem(data: ItemData) {
    // Use data-testid for buttons
    const addButton = this.page.getByTestId('add-item-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();

    // Fill form using IDs
    await this.page.locator('#name').fill(data.name);
    await this.page.locator('#amount').fill(data.amount.toString());

    // Submit and wait for form to close
    const submitButton = this.page.getByTestId('item-form-submit');
    await submitButton.click();
    await submitButton.waitFor({ state: 'hidden' });

    // Wait for network to settle
    await this.page.waitForLoadState('networkidle');
  }

  async expectItemInList(name: string) {
    await expect(this.page.getByText(name)).toBeVisible();
  }
}
```

**Why:** POMs encapsulate page interactions, making tests readable and maintainable.

**DON'T put in Page Objects:**
- ❌ `console.log` statements (use Playwright's debugging tools)
- ❌ Test assertions (except for helper methods like `expectItemInList`)
- ❌ Test data creation (use PocketBase helpers instead)

##### 5. Test Data Management

**Use API helpers for test data:**

```typescript
// ✅ GOOD - Fast API setup
test('should edit item', async ({ userPocketbase }) => {
  // Create via API (fast)
  const item = await createItem(userPocketbase, testData.item1);

  await myPage.goto();

  // Test the edit operation
  await myPage.editItem(item.name, { amount: 100 });

  // Verify in database
  const updated = await userPocketbase.collection('items').getOne(item.id);
  expect(updated.amount).toBe(100);
});

// ❌ BAD - Slow UI setup
test('should edit item', async () => {
  // Don't create via UI if you're testing edit
  await myPage.createItem(testData.item1);
  await myPage.editItem(testData.item1.name, { amount: 100 });
});
```

**Why:** API setup is 10-100x faster than UI interaction. Only test UI operations you're actually testing.

**Centralize test data:**

```typescript
// tests/e2e/fixtures/test-data.ts
export const testItems = [
  { name: 'Item 1', amount: 50 },
  { name: 'Item 2', amount: 75 },
];

// Use in tests
import { testItems } from '../../fixtures/test-data';
```

##### 6. Error Handling and Debugging

**DON'T use console.log in page objects or tests:**

```typescript
// ❌ BAD
console.log('[MyPage] Clicking button...');
await button.click();
console.log('[MyPage] Button clicked');

// ✅ GOOD - Use Playwright's built-in debugging
// Run with: npm run test:debug
// Or use --headed flag to see browser
```

**For debugging, use:**

```bash
# Interactive debugging
npm run test:debug

# Run in headed mode to see browser
npm run test:headed

# UI mode (best for debugging)
npm run test:ui

# Generate trace on failure (automatic)
# View with: npx playwright show-trace trace.zip
```

**Consistent error handling:**

```typescript
// ✅ GOOD - Handle optional elements cleanly
const confirmButton = page.getByRole('button', { name: /confirm/i });
const isVisible = await confirmButton.isVisible({ timeout: 1000 })
  .catch(() => false);

if (isVisible) {
  await confirmButton.click();
}

// ❌ BAD - Silent failures
.catch(() => {}) // Don't swallow errors without reason
```

##### 7. New Module E2E Checklist

**When adding a new module, create e2e tests following this structure:**

1. **Add test IDs to components:**
   ```tsx
   <button data-testid="add-{module}-button">Add {Module}</button>
   <button data-testid="{module}-form-submit">Submit</button>
   <button data-testid="{module}-form-cancel">Cancel</button>
   ```

2. **Create Page Object Model:**
   ```
   tests/e2e/pages/{Module}Page.ts
   ```

3. **Create API helpers:**
   ```typescript
   // tests/e2e/utils/pocketbase-helpers.ts
   export async function create{Module}(pb: PocketBase, data: {Module}Data) {
     return await pb.collection('{modules}').create(data);
   }

   export async function deleteAll{Modules}(pb: PocketBase) {
     const records = await pb.collection('{modules}').getFullList();
     for (const record of records) {
       await pb.collection('{modules}').delete(record.id);
     }
   }
   ```

4. **Create test suite:**
   ```
   tests/e2e/tests/{module}/{module}-crud.spec.ts
   ```

5. **Test structure:**
   ```typescript
   test.describe('{Module} CRUD', () => {
     let {module}Page: {Module}Page;

     test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
       {module}Page = new {Module}Page(authenticatedPage);
       await deleteAll{Modules}(userPocketbase);
       await {module}Page.goto();
     });

     test('should create a {module}', async () => {
       // Test implementation
     });

     test('should edit a {module}', async ({ userPocketbase }) => {
       // Test implementation
     });

     test('should delete a {module}', async ({ userPocketbase }) => {
       // Test implementation
     });
   });
   ```

6. **Run tests:**
   ```bash
   cd tests/e2e && npm run test:{module}
   ```

##### 8. Common Patterns

**Verifying database state:**

```typescript
// ✅ GOOD - Verify both DB and UI
const updated = await userPocketbase.collection('items').getOne(itemId);
expect(updated.amount).toBe(newAmount);
await myPage.expectItemInList('Item Name', newAmount);
```

**Handling modals/dialogs:**

```typescript
async submitForm() {
  const submitButton = this.page.getByTestId('form-submit');
  await submitButton.click();
  // Wait for modal to close
  await submitButton.waitFor({ state: 'hidden' });
  // Wait for mutation to complete
  await this.page.waitForLoadState('networkidle');
}
```

**Conditional interactions:**

```typescript
// Check if confirmation dialog appears
const confirmButton = this.page.getByRole('button', { name: /confirm/i });
const isVisible = await confirmButton.isVisible({ timeout: 1000 })
  .catch(() => false);

if (isVisible) {
  await confirmButton.click();
}
```

**Summary: E2E Testing Principles**

1. ✅ **Isolation**: Each test gets a unique user and clean data
2. ✅ **Explicit waits**: Use `waitFor()` and `waitForLoadState()`, not hardcoded timeouts
3. ✅ **Stable selectors**: Prefer `data-testid` > roles > labels > text
4. ✅ **Page Objects**: Encapsulate page interactions
5. ✅ **API setup**: Create test data via PocketBase API, not UI
6. ✅ **No logging**: Use Playwright's debugging tools instead
7. ✅ **Fast and reliable**: Tests should run quickly and pass consistently

## Code Quality Standards

### TypeScript

- Use strict type checking (enabled in `tsconfig.json`)
- Avoid `any` types - use proper type definitions
- Export types that might be reused
- Use interfaces for object shapes

### React

- Prefer functional components with hooks
- Use custom hooks for reusable logic
- Keep components focused and single-purpose
- Follow the modular architecture pattern

### Modular Architecture

Every feature should be a self-contained module:

```
src/modules/feature-name/
├── components/          # UI components
├── hooks/              # Custom hooks
├── types.ts            # TypeScript types
├── routes.tsx          # Route definitions
├── module.config.ts    # Module metadata
└── index.ts           # Public exports
```

### Code Style

- Use meaningful variable and function names
- Write self-documenting code
- Add comments only for complex logic
- Keep functions small and focused
- Avoid premature optimization

## PocketBase Migrations

### Important: Use the Correct Migration API

PocketBase 0.34.2 uses the **Collection API** for migrations. **DO NOT** use the old Dao pattern.

#### ✅ Correct - Collection API (Use This)

```javascript
/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("my_collection");

  // Add a field
  collection.fields.add(new TextField({
    name: "my_field",
    required: false,
    max: 255
  }));

  // Add a boolean field
  collection.fields.add(new BoolField({
    name: "archived",
    required: false
  }));

  // Add a file field
  collection.fields.add(new FileField({
    name: "image",
    required: false,
    maxSelect: 1,
    maxSize: 5242880,
    mimeTypes: ["image/jpeg", "image/png"]
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("my_collection");

  // Remove fields safely
  const field = collection.fields.getByName("my_field");
  if (field) {
    collection.fields.removeById(field.id);
  }

  return app.save(collection);
});
```

#### ❌ Incorrect - Dao Pattern (DO NOT USE)

```javascript
// DO NOT USE THIS PATTERN
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("my_collection")

  collection.schema.addField(new SchemaField({
    // ...
  }))

  return dao.saveCollection(collection)
})
```

### Key Points

- Always use `migrate((app) => ...)` NOT `migrate((db) => ...)`
- Use `app.findCollectionByNameOrId()` NOT `new Dao(db).findCollectionByNameOrId()`
- Use `collection.fields.add(new FieldType(...))` NOT `collection.schema.addField()`
- Use typed field constructors: `TextField`, `BoolField`, `FileField`, etc.
- Use `app.save(collection)` NOT `dao.saveCollection(collection)`
- Always include rollback logic in the second function parameter

### Testing Migrations Locally

Test migrations by running PocketBase locally:

```bash
# Start PocketBase (will auto-apply migrations)
./pocketbase serve

# Verify collections in admin UI
open http://127.0.0.1:8090/_/
```

## Project Structure

### Frontend (`frontend/`)

- **`src/core/`** - Core infrastructure (auth, routing, API)
- **`src/modules/`** - Feature modules (dashboard, gift-cards, etc.)
- **`src/shared/`** - Shared components and utilities
- **`src/test/`** - Test setup and utilities

### Backend

- **`pb_migrations/`** - PocketBase database migrations
- **`pocketbase/`** - PocketBase binary and data (not in git)

### Tests

- **`frontend/src/**/*.test.ts(x)`** - Frontend unit/integration tests

## Common Commands Quick Reference

```bash
# Install dependencies
make install

# Start development server
make dev

# Run all quality checks
make ci && make test

# Individual checks
make lint             # ESLint
make type-check       # TypeScript
make build            # Production build
make test             # Frontend tests
make test-migrations  # PocketBase migration tests
make test-hooks       # PocketBase hook validation
make test-e2e         # End-to-end tests
make test-all         # All tests

# E2E tests
make test-e2e         # Run all e2e tests
make test-e2e-ui      # Run e2e tests in UI mode

# Clean build artifacts
make clean

# Security audit
make audit
```

## For Claude AI Assistants

When working on this project:

1. **Always run the full test suite** before marking tasks complete
2. **Follow the modular architecture** - don't create monolithic components
3. **Respect existing patterns** - review similar code before implementing
4. **Use correct PocketBase migration API** - Collection API (app), NOT Dao pattern (db)
5. **Ask clarifying questions** if requirements are unclear
6. **Document complex logic** - but prefer self-explanatory code
7. **Security first** - validate inputs, sanitize outputs, follow OWASP guidelines

### Before Every PR Push

Run this command and verify all checks pass:

```bash
make ci && make test
```

Only push when all checks pass successfully.

---

## aepbase Backend (migration in progress)

We are migrating the HomeOS backend from **PocketBase** to **aepbase** (an
AEP-compliant dynamic REST server). The schema is defined in Terraform using
the `aep-dev/aep` provider. See `aepbase/README.md` for full details.

### Current state

- PocketBase (`pb_migrations/`, `pb_hooks/`, `pocketbase/`) is still the
  source of truth for the running app. The frontend talks to it, tests rely
  on it, and `make` targets build it.
- `aepbase/` is the staging area for the new backend. Its terraform files
  model every PocketBase collection as an AEP resource definition. Applying
  them stands up a fresh aepbase instance with the equivalent schema.

### Running aepbase locally

```bash
cd aepbase
./install.sh                            # builds bin/aepbase
./run.sh                                # serves on :8090
# in another terminal:
cd aepbase/terraform
export AEP_OPENAPI=http://localhost:8090/openapi.json
terraform init && terraform apply
```

### Rules for editing `aepbase/terraform/`

1. **Resource type in HCL is `aep_aep-resource-definition`** (yes, the hyphen
   is real — it's what the dynamic provider generates from the meta-API).
2. **Singular/plural must be kebab-case, not camelCase.** `gift-card`, not
   `giftCard`. Terraform's plugin framework rejects URL params that contain
   uppercase letters, and a camelCase singular produces invalid params like
   `giftCard_id`.
3. **JSON Schema `enum`, `minimum`, `maximum` are stripped by aepbase on
   round-trip.** Using them causes terraform apply to fail with *"Provider
   produced inconsistent result after apply"*. Encode allowed values in
   `description` instead:
   ```hcl
   status = { type = "string", description = "one of: pending, success, error" }
   ```
4. **Child resources need explicit `depends_on`.** Setting `parents = ["foo"]`
   alone does not create a terraform dependency — add
   `depends_on = [aep_aep-resource-definition.foo]`.
5. **Field names inside the JSON schema stay snake_case** to match existing
   PB data (e.g. `card_number`, `created_by`, `service_date`).
6. **Don't add autodate fields** (`created`, `updated`). aepbase manages
   `create_time` and `update_time` itself.
7. **After editing an aepbase resource definition out of band**, run
   `terraform init -upgrade` so the provider re-reads `/openapi.json`.

### Parent/child relationships

Where PocketBase used a cascade-delete relation, model it as an AEP parent
(not as a plain string FK field). Current parented resources:

| Child          | Parent        |
|----------------|---------------|
| `transaction`  | `gift-card`   |
| `perk`         | `credit-card` |
| `redemption`   | `perk`        |
| `run`          | `action`      |
| `log`          | `recipe`      |

When making a resource a child, **remove the FK field from its schema** —
it's encoded in the URL path (`/gift-cards/{id}/transactions/{id}`).

### Not yet migrated

Auth, file uploads, access rules, the `users` collection. Do not assume
feature parity with PocketBase. If a task depends on one of these, flag it.

---

**Remember:** The goal is to maintain high code quality while moving quickly. These checks exist to catch issues early and keep the codebase healthy.
