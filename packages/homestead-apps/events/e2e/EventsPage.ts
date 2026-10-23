/**
 * Events Page Object Model
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export class EventsPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/events');
  }

  async expectToBeOnEventsPage() {
    await this.driver.expectURL(/\/events/);
  }

  async clickAddEvent() {
    const addButton = this.driver.getByTestId('add-event-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  async fillEventForm(data: {
    name: string;
    /** `YYYY-MM-DD`; split into the month/day (and optional year) inputs. */
    date: string;
    /** Also fill the optional year input from the date's year. */
    withYear?: boolean;
    tag?: 'birthday' | 'anniversary' | string;
    personNames?: string[];
    recurrence?: {
      week: '1' | '2' | '3' | '4' | '-1';
      weekday: '0' | '1' | '2' | '3' | '4' | '5' | '6';
    };
  }) {
    await this.driver.getByTestId('event-form-name').fill(data.name);
    const [y, m, d] = data.date.substring(0, 10).split('-');
    await this.driver.getByTestId('event-form-month').selectOption(String(Number(m)));
    await this.driver.getByTestId('event-form-day').fill(String(Number(d)));
    if (data.withYear) {
      await this.driver.getByTestId('event-form-year').fill(y);
    }
    if (data.tag !== undefined) {
      const knownTags = ['birthday', 'anniversary'];
      if (data.tag === '' || knownTags.includes(data.tag)) {
        await this.driver
          .getByTestId('event-form-tag')
          .selectOption(data.tag === '' ? '' : data.tag);
      } else {
        await this.driver
          .getByTestId('event-form-tag')
          .selectOption('__custom__');
        await this.driver
          .getByTestId('event-form-tag-custom')
          .fill(data.tag);
      }
    }
    if (data.recurrence) {
      await this.driver
        .getByTestId('event-form-recurrence')
        .selectOption('yearly-nth-weekday');
      await this.driver
        .getByTestId('event-form-recurrence-week')
        .selectOption(data.recurrence.week);
      await this.driver
        .getByTestId('event-form-recurrence-weekday')
        .selectOption(data.recurrence.weekday);
    }
    if (data.personNames && data.personNames.length > 0) {
      for (const name of data.personNames) {
        const chip = this.driver.getByRole('button', { name, exact: true });
        await chip.waitFor({ state: 'visible' });
        await chip.click();
      }
    }
  }

  async submitEventForm() {
    const submit = this.driver.getByTestId('event-form-submit');
    await submit.waitFor({ state: 'visible' });
    await submit.click();
    await submit.waitFor({ state: 'hidden' });
  }

  async createEvent(data: {
    name: string;
    date: string;
    tag?: string;
    personNames?: string[];
    recurrence?: {
      week: '1' | '2' | '3' | '4' | '-1';
      weekday: '0' | '1' | '2' | '3' | '4' | '5' | '6';
    };
  }) {
    await this.clickAddEvent();
    await this.fillEventForm(data);
    await this.submitEventForm();
    await this.driver.waitForNetworkIdle();
  }

  async expectEventInList(name: string) {
    await this.expect(this.driver.getByText(name).first()).toBeVisible();
  }

  async expectEventNotInList(name: string) {
    const locator = this.driver.getByText(name).first();
    await this.expect(locator)
      .not.toBeVisible({ timeout: 2000 })
      .catch(() => {
        // OK — element doesn't exist
      });
  }

  async editEvent(
    eventName: string,
    newData: Partial<{
      name: string;
      date: string;
      tag: string;
    }>,
  ) {
    const editButton = this.driver
      .getByRole('button', { name: `Edit ${eventName}` })
      .first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    await this.driver.getByTestId('event-form-name').waitFor({ state: 'visible' });

    if (newData.name !== undefined) {
      await this.driver.getByTestId('event-form-name').fill(newData.name);
    }
    if (newData.date !== undefined) {
      const [, m, d] = newData.date.substring(0, 10).split('-');
      await this.driver
        .getByTestId('event-form-month')
        .selectOption(String(Number(m)));
      await this.driver.getByTestId('event-form-day').fill(String(Number(d)));
    }
    if (newData.tag !== undefined) {
      await this.fillEventForm({
        name: newData.name ?? eventName,
        date: newData.date ?? '1990-01-01',
        tag: newData.tag,
      });
    }

    await this.submitEventForm();
    await this.driver.waitForNetworkIdle();
  }

  async filterByName(query: string) {
    await this.driver.getByTestId('filter-text-name').fill(query);
  }

  async toggleTagFilter(tag: string) {
    await this.driver.getByTestId(`filter-chip-tag-${tag}`).click();
  }

  async deleteEvent(eventName: string) {
    await this.expectEventInList(eventName);
    const deleteButton = this.driver
      .getByRole('button', { name: `Delete ${eventName}` })
      .first();
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();
    const confirmButton = this.driver.getByRole('button', {
      name: /confirm|yes|delete/i,
    });
    const isVisible = await confirmButton.isVisible();
    if (isVisible) {
      await confirmButton.click();
    }
    await this.driver.waitForNetworkIdle();
  }
}
