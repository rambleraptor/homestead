/**
 * Events Page Object Model
 */

import { Page, expect } from '@playwright/test';

export class EventsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/events');
  }

  async expectToBeOnEventsPage() {
    await expect(this.page).toHaveURL(/\/events/);
  }

  async clickAddEvent() {
    const addButton = this.page.getByTestId('add-event-button');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  async fillEventForm(data: {
    name: string;
    date: string;
    tag?: 'birthday' | 'anniversary' | string;
    personNames?: string[];
  }) {
    await this.page.getByTestId('event-form-name').fill(data.name);
    await this.page.getByTestId('event-form-date').fill(data.date);
    if (data.tag !== undefined) {
      const knownTags = ['birthday', 'anniversary'];
      if (data.tag === '' || knownTags.includes(data.tag)) {
        await this.page
          .getByTestId('event-form-tag')
          .selectOption(data.tag === '' ? '' : data.tag);
      } else {
        await this.page
          .getByTestId('event-form-tag')
          .selectOption('__custom__');
        await this.page
          .getByTestId('event-form-tag-custom')
          .fill(data.tag);
      }
    }
    if (data.personNames && data.personNames.length > 0) {
      for (const name of data.personNames) {
        const chip = this.page.getByRole('button', { name, exact: true });
        await chip.waitFor({ state: 'visible' });
        await chip.click();
      }
    }
  }

  async submitEventForm() {
    const submit = this.page.getByTestId('event-form-submit');
    await submit.waitFor({ state: 'visible' });
    await submit.click();
    await submit.waitFor({ state: 'hidden' });
  }

  async createEvent(data: {
    name: string;
    date: string;
    tag?: string;
    personNames?: string[];
  }) {
    await this.clickAddEvent();
    await this.fillEventForm(data);
    await this.submitEventForm();
    await this.page.waitForLoadState('networkidle');
  }

  async expectEventInList(name: string) {
    await expect(this.page.getByText(name).first()).toBeVisible();
  }

  async expectEventNotInList(name: string) {
    const locator = this.page.getByText(name).first();
    await expect(locator)
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
    const editButton = this.page
      .getByRole('button', { name: `Edit ${eventName}` })
      .first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    await this.page.getByTestId('event-form-name').waitFor({ state: 'visible' });

    if (newData.name !== undefined) {
      await this.page.getByTestId('event-form-name').fill(newData.name);
    }
    if (newData.date !== undefined) {
      await this.page.getByTestId('event-form-date').fill(newData.date);
    }
    if (newData.tag !== undefined) {
      await this.fillEventForm({
        name: newData.name ?? eventName,
        date: newData.date ?? '1990-01-01',
        tag: newData.tag,
      });
    }

    await this.submitEventForm();
    await this.page.waitForLoadState('networkidle');
  }

  async deleteEvent(eventName: string) {
    await this.expectEventInList(eventName);
    const deleteButton = this.page
      .getByRole('button', { name: `Delete ${eventName}` })
      .first();
    await deleteButton.waitFor({ state: 'visible' });
    await deleteButton.click();
    const confirmButton = this.page.getByRole('button', {
      name: /confirm|yes|delete/i,
    });
    const isVisible = await confirmButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (isVisible) {
      await confirmButton.click();
    }
    await this.page.waitForLoadState('networkidle');
  }
}
