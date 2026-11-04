/**
 * Eval cases Page Object Model.
 *
 * Covers the superuser-only Eval cases app (`/superuser/eval-cases`): the
 * assistant replies people rated, each with its conversation, reviewed by
 * saying what the reply should have done and setting a status.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class EvalCasesPage {
  constructor(readonly driver: Driver) {}

  async goto() {
    await this.driver.goto('/superuser/eval-cases');
  }

  get list(): Locator {
    return this.driver.getByTestId('eval-cases-list');
  }

  get emptyState(): Locator {
    return this.driver.getByTestId('eval-cases-empty');
  }

  /** A case's card, by id. */
  card(id: string): Locator {
    return this.driver.getByTestId(`eval-case-${id}`);
  }

  /** A status filter button: new, ready, retired, or all. */
  filter(status: 'new' | 'ready' | 'retired' | 'all'): Locator {
    return this.driver.getByTestId(`eval-cases-filter-${status}`);
  }

  /** Open a case, write what the reply should have done, set its status, and save. */
  async review(id: string, { expected, status }: { expected?: string; status?: 'new' | 'ready' | 'retired' }) {
    const card = this.card(id);
    await card.getByTestId('eval-case-toggle').click();
    if (expected !== undefined) await card.getByTestId('eval-case-expected').fill(expected);
    if (status) await card.getByTestId('eval-case-status').selectOption(status);
    await card.getByTestId('eval-case-save').click();
  }
}
