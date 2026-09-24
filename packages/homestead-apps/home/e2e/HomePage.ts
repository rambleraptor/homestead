/**
 * Home Page Object Model — the Upkeep and Devices sections of `/home`.
 *
 * The pickup calendar above them is written by a sync and has no
 * interactions to drive.
 */

import { Page, expect, Locator } from '@playwright/test';

export interface HomeTaskFormInput {
  name?: string;
  interval_count?: number;
  interval_unit?: 'day' | 'week' | 'month' | 'year';
  next_due?: string;
  lead_days?: number;
  notes?: string;
}

export class HomePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/home');
  }

  async expectToBeOnHomePage() {
    await expect(this.page).toHaveURL(/\/home/);
  }

  taskRow(name: string): Locator {
    return this.page.getByTestId('home-task-row').filter({ hasText: name }).first();
  }

  async clickAddTask() {
    const addButton = this.page.getByTestId('home-task-add');
    await addButton.waitFor({ state: 'visible' });
    await addButton.click();
  }

  async fillTaskForm(data: HomeTaskFormInput) {
    if (data.name !== undefined) {
      await this.page.locator('#home-task-name').fill(data.name);
    }
    if (data.interval_count !== undefined) {
      await this.page.locator('#home-task-interval-count').fill(String(data.interval_count));
    }
    if (data.interval_unit !== undefined) {
      await this.page.locator('#home-task-interval-unit').selectOption(data.interval_unit);
    }
    if (data.next_due !== undefined) {
      await this.page.locator('#home-task-next-due').fill(data.next_due);
    }
    if (data.lead_days !== undefined) {
      await this.page.locator('#home-task-lead-days').fill(String(data.lead_days));
    }
    if (data.notes !== undefined) {
      await this.page.locator('#home-task-notes').fill(data.notes);
    }
  }

  async submitTaskForm() {
    const submitButton = this.page.getByTestId('home-task-form-submit');
    await submitButton.waitFor({ state: 'visible' });
    await submitButton.click();
    // The modal closes once the mutation lands.
    await submitButton.waitFor({ state: 'hidden' });
  }

  async createTask(data: HomeTaskFormInput) {
    await this.clickAddTask();
    await this.fillTaskForm(data);
    await this.submitTaskForm();
  }

  async editTask(name: string, newData: HomeTaskFormInput) {
    await this.taskRow(name).getByTestId('home-task-edit').click();
    await this.page.locator('#home-task-name').waitFor({ state: 'visible' });
    await this.fillTaskForm(newData);
    await this.submitTaskForm();
  }

  async completeTask(name: string) {
    await this.taskRow(name).getByTestId('home-task-done').click();
  }

  async togglePause(name: string) {
    await this.taskRow(name).getByTestId('home-task-pause').click();
  }

  async deleteTask(name: string) {
    await this.taskRow(name).getByTestId('home-task-delete').click();
    const confirmButton = this.page.getByRole('button', { name: /^delete$/i }).last();
    await confirmButton.waitFor({ state: 'visible' });
    await confirmButton.click();
  }

  async expectTaskInList(name: string) {
    await expect(this.taskRow(name)).toBeVisible();
  }

  async expectTaskNotInList(name: string) {
    await expect(
      this.page.getByTestId('home-task-row').filter({ hasText: name }),
    ).toHaveCount(0);
  }

  async expectEmptyState() {
    await expect(this.page.getByTestId('home-tasks-empty')).toBeVisible();
  }

  async expectSchedule(name: string, text: string | RegExp) {
    await expect(this.taskRow(name).getByTestId('home-task-schedule')).toHaveText(
      typeof text === 'string' ? new RegExp(text) : text,
    );
  }

  async expectNotes(name: string, text: string | RegExp) {
    await expect(this.taskRow(name).getByTestId('home-task-notes')).toContainText(text);
  }

  async expectUrgency(name: string, text: string | RegExp) {
    await expect(this.taskRow(name).getByTestId('home-task-urgency')).toHaveText(text);
  }

  // --- Devices -------------------------------------------------------------

  deviceRow(name: string): Locator {
    return this.page.getByTestId('device-row').filter({ hasText: name }).first();
  }

  async setThreshold(name: string, percent: number) {
    await this.deviceRow(name).getByTestId('device-threshold').selectOption(String(percent));
  }

  async forgetDevice(name: string) {
    await this.deviceRow(name).getByTestId('device-delete').click();
    const confirmButton = this.page.getByRole('button', { name: /^forget$/i }).last();
    await confirmButton.waitFor({ state: 'visible' });
    await confirmButton.click();
  }

  async expectNoDevices() {
    await expect(this.page.getByTestId('devices-empty')).toBeVisible();
  }

  async expectDeviceInList(name: string) {
    await expect(this.deviceRow(name)).toBeVisible();
  }

  async expectDeviceNotInList(name: string) {
    await expect(this.page.getByTestId('device-row').filter({ hasText: name })).toHaveCount(0);
  }

  async expectBattery(name: string, text: string | RegExp) {
    await expect(this.deviceRow(name).getByTestId('device-battery')).toHaveText(text);
  }
}
