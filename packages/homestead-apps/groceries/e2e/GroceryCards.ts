/**
 * The groceries app's cards, where Homestead shows grocery items it doesn't
 * otherwise draw — an item the assistant added, or the list it read, in a
 * reply. Written against the shared `Driver`.
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class GroceryCards {
  constructor(readonly driver: Driver) {}

  /** Every grocery card on the page, in order. */
  get all(): Locator {
    return this.driver.getByTestId('grocery-card');
  }

  /** The grocery card for this item. */
  card(name: string): Locator {
    return this.all.filter({ has: this.driver.getByTestId('grocery-card-name').filter({ hasText: name }) });
  }

  /** Tick (or untick) an item's checkbox. */
  async toggle(name: string) {
    await this.card(name).getByTestId('grocery-card-check').click();
  }

  /** A list card: the items a reply looked at, by store. */
  get list(): Locator {
    return this.driver.getByTestId('grocery-list-card');
  }

  /** The list card's store groups, in order; each carries its store's name in `data-store`. */
  get groups(): Locator {
    return this.list.getByTestId('grocery-list-group');
  }

  /** The group for one store ("No store" for items without one). */
  group(store: string): Locator {
    return this.groups.filter({ has: this.driver.getByRole('heading', { name: store }) });
  }

  /** The list card's "Share with the household" button. */
  get shareButton(): Locator {
    return this.list.getByTestId('grocery-list-share');
  }
}
