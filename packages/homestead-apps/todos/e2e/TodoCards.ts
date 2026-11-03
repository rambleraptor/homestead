/**
 * The todos app's cards, where Homestead shows a todo it doesn't otherwise
 * draw — a todo the assistant added, changed or listed, in a reply. Written
 * against the shared `Driver`, like the app's page objects.
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class TodoCards {
  constructor(readonly driver: Driver) {}

  /** Every todo card on the page, in order. */
  get all(): Locator {
    return this.driver.getByTestId('todo-card');
  }

  /** The todo card with this title. */
  card(title: string): Locator {
    return this.all.filter({ has: this.driver.getByTestId('todo-card-title').filter({ hasText: title }) });
  }

  /** The titles of the todo cards, in order. */
  get titles(): Locator {
    return this.driver.getByTestId('todo-card-title');
  }

  /** A list card: the todos a reply looked at. */
  get list(): Locator {
    return this.driver.getByTestId('todo-list-card');
  }

  /** Tick (or untick) a todo's checkbox. */
  async toggleDone(title: string) {
    await this.card(title).getByTestId('todo-card-check').click();
  }

  /** Move a todo to Do Later, or back onto the list. */
  async toggleLater(title: string) {
    await this.card(title).getByTestId('todo-card-toggle-later').click();
  }

  /** The "Later" badge on a todo's card. */
  laterBadge(title: string): Locator {
    return this.card(title).getByTestId('todo-card-later');
  }

  /** The note a todo's card shows once the todo is gone. */
  removedNote(title: string): Locator {
    return this.card(title).getByTestId('todo-card-removed');
  }
}
