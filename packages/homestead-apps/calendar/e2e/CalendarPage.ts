/**
 * Calendar Page Object Model — the month, week and agenda views of
 * `/calendar`, the event form and details dialogs, and the calendars manager.
 *
 * Written against the shared `Driver`, so it drives both the Playwright suite
 * (`playwrightDriver(page)`) and the in-process VM tier (`../vm/`).
 */

import type { Driver, Locator } from '../../../homestead-test-harness/driver/Driver';

export interface EventFormInput {
  title?: string;
  calendar?: string;
  allDay?: boolean;
  startDay?: string;
  startTime?: string;
  endDay?: string;
  endTime?: string;
  repeat?: 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
  untilDay?: string;
  location?: string;
  notes?: string;
}

export class CalendarPage {
  constructor(readonly driver: Driver) {}

  private expect(locator: Locator) {
    return this.driver.expect(locator);
  }

  async goto() {
    await this.driver.goto('/calendar');
  }

  // --- Calendars ---------------------------------------------------------

  async openCalendarsFromEmptyState() {
    await this.driver.getByTestId('calendar-empty-create').click();
  }

  async openCalendars() {
    await this.driver.getByTestId('calendar-manage').click();
  }

  async addCalendar(name: string, color?: string) {
    await this.driver.locator('#calendar-name').fill(name);
    if (color) await this.driver.locator('#calendar-color').selectOption(color);
    await this.driver.getByTestId('calendar-form-submit').click();
    await this.calendarRow(name).waitFor({ state: 'visible' });
  }

  calendarRow(name: string): Locator {
    return this.driver.getByTestId('calendar-row').filter({ hasText: name }).first();
  }

  async deleteCalendar(name: string) {
    await this.calendarRow(name).getByTestId('calendar-row-delete').click();
    await this.confirmDelete();
  }

  async closeDialog() {
    await this.driver.getByRole('button', { name: /^close$/i }).first().click();
  }

  legendItem(name: string): Locator {
    return this.driver.getByTestId('calendar-legend-item').filter({ hasText: name }).first();
  }

  async toggleCalendar(name: string) {
    await this.legendItem(name).click();
  }

  // --- Views -------------------------------------------------------------

  async showView(view: 'month' | 'week' | 'agenda') {
    await this.driver.getByTestId(`calendar-view-${view}`).click();
  }

  async next() {
    await this.driver.getByTestId('calendar-next').click();
  }

  async today() {
    await this.driver.getByTestId('calendar-today').click();
  }

  day(day: string): Locator {
    return this.driver.locator(`[data-testid="calendar-day"][data-day="${day}"]`);
  }

  chip(title: string): Locator {
    return this.driver.getByTestId('calendar-event-chip').filter({ hasText: title });
  }

  chipOn(day: string, title: string): Locator {
    return this.day(day).getByTestId('calendar-event-chip').filter({ hasText: title });
  }

  // --- Events ------------------------------------------------------------

  async clickNewEvent() {
    await this.driver.getByTestId('calendar-new-event').click();
    await this.driver.locator('#calendar-event-title').waitFor({ state: 'visible' });
  }

  async clickAddOn(day: string) {
    await this.day(day).getByTestId('calendar-day-add').click();
    await this.driver.locator('#calendar-event-title').waitFor({ state: 'visible' });
  }

  async fillEventForm(data: EventFormInput) {
    if (data.title !== undefined) {
      await this.driver.locator('#calendar-event-title').fill(data.title);
    }
    if (data.calendar !== undefined) {
      await this.driver.locator('#calendar-event-calendar').selectOption({ label: data.calendar });
    }
    if (data.allDay !== undefined) {
      const box = this.driver.locator('#calendar-event-all-day');
      if (data.allDay) await box.check();
      else await box.uncheck();
    }
    if (data.startDay !== undefined) {
      await this.driver.locator('#calendar-event-start-day').fill(data.startDay);
    }
    if (data.startTime !== undefined) {
      await this.driver.locator('#calendar-event-start-time').fill(data.startTime);
    }
    if (data.endDay !== undefined) {
      await this.driver.locator('#calendar-event-end-day').fill(data.endDay);
    }
    if (data.endTime !== undefined) {
      await this.driver.locator('#calendar-event-end-time').fill(data.endTime);
    }
    if (data.repeat !== undefined) {
      await this.driver.locator('#calendar-event-repeat').selectOption(data.repeat);
    }
    if (data.untilDay !== undefined) {
      await this.driver.locator('#calendar-event-until').fill(data.untilDay);
    }
    if (data.location !== undefined) {
      await this.driver.locator('#calendar-event-location').fill(data.location);
    }
    if (data.notes !== undefined) {
      await this.driver.locator('#calendar-event-notes').fill(data.notes);
    }
  }

  async clickSubmitEvent() {
    await this.driver.getByTestId('calendar-event-form-submit').click();
  }

  async submitEventForm() {
    const submit = this.driver.getByTestId('calendar-event-form-submit');
    await submit.click();
    // The dialog closes once the mutation lands.
    await submit.waitFor({ state: 'hidden' });
  }

  async createEvent(data: EventFormInput) {
    await this.clickNewEvent();
    await this.fillEventForm(data);
    await this.submitEventForm();
  }

  async openEvent(day: string, title: string) {
    await this.chipOn(day, title).first().click();
    await this.driver.getByTestId('calendar-event-details').waitFor({ state: 'visible' });
  }

  async editOpenEvent(data: EventFormInput, scope: 'one' | 'all' = 'one') {
    await this.driver
      .getByTestId(scope === 'all' ? 'calendar-event-edit-series' : 'calendar-event-edit')
      .click();
    await this.driver.locator('#calendar-event-title').waitFor({ state: 'visible' });
    await this.fillEventForm(data);
    await this.submitEventForm();
  }

  async deleteOpenEvent(scope: 'one' | 'all' = 'one') {
    await this.driver
      .getByTestId(scope === 'all' ? 'calendar-event-delete-series' : 'calendar-event-delete')
      .click();
    await this.confirmDelete();
    await this.driver.getByTestId('calendar-event-details').waitFor({ state: 'hidden' });
  }

  private async confirmDelete() {
    const confirm = this.driver.getByRole('button', { name: /^delete$/i }).last();
    await confirm.waitFor({ state: 'visible' });
    await confirm.click();
  }

  // --- Expectations ------------------------------------------------------

  async expectEmptyState() {
    await this.expect(this.driver.getByTestId('calendar-empty')).toBeVisible();
  }

  async expectEventOn(day: string, title: string) {
    await this.expect(this.chipOn(day, title).first()).toBeVisible();
  }

  async expectNoEventOn(day: string, title: string) {
    await this.expect(this.day(day)).toBeVisible();
    await this.expect(this.chipOn(day, title)).toHaveCount(0);
  }

  async expectEventCount(title: string, count: number) {
    await this.expect(this.chip(title)).toHaveCount(count);
  }

  async expectFormError(message: string | RegExp) {
    await this.expect(this.driver.getByTestId('calendar-event-form')).toContainText(message);
  }

  async expectDetails(text: string | RegExp) {
    await this.expect(this.driver.getByTestId('calendar-event-details')).toContainText(text);
  }
}
