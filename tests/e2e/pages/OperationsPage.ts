/**
 * Operations Page Object Model.
 *
 * Covers the superuser-only Operations app (`/superuser/operations`) which
 * lists AEP-151 long-running operations and polls while any are in flight.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`tests/vm/`).
 */

import type { Driver, Locator } from '../../../packages/homestead-test-harness/driver/Driver';

export class OperationsPage {
  constructor(readonly driver: Driver) {}

  /**
   * Full navigation to /superuser/operations. A hard load (rather than a
   * client-side route change) remounts the operations query so it picks up any
   * in-flight operation and starts polling.
   */
  async goto() {
    await this.driver.goto('/superuser/operations');
  }

  /** The row for a specific operation id. */
  operationRow(operationId: string): Locator {
    return this.driver.getByTestId(`operation-${operationId}`);
  }

  /** The list container, present once at least one operation has rendered. */
  get list(): Locator {
    return this.driver.getByTestId('operations-list');
  }
}
