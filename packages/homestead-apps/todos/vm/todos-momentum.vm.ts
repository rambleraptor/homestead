/**
 * The momentum widget, on the VM tier: what the household finished this week
 * reaches the home's strip as one line, and the widget behind the chip shows
 * the numbers. Completed todos seeded through the API are stamped now, so
 * each counts for today — a one-day streak.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { DashboardPage } from '../../../../tests/e2e/pages/DashboardPage';
import { createTodo } from '../e2e/helpers';

describe('Todos momentum', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHomestead();
  });

  afterEach(async () => {
    await h.close();
  });

  test('the chip sums the week and the streak, and opens the widget', async () => {
    const { token } = await h.loginAs(h.member);
    await createTodo(token, { title: 'Book the dentist', status: 'completed' });
    await createTodo(token, { title: 'Return the library books', status: 'completed' });
    // Struck out is not finished, and open is not either.
    await createTodo(token, { title: 'Learn the accordion', status: 'cancelled' });
    await createTodo(token, { title: 'Fix the gate', status: 'pending' });

    const d = h.driver;
    const dashboard = new DashboardPage(d);
    await d.goto('/dashboard');
    await d.expect(dashboard.agenticHome).toBeVisible();

    const chip = dashboard.widgetChip('todos-momentum');
    await d.expect(chip).toBeVisible();
    await d.expect(chip).toContainText('1-day streak · 2 done this week');

    await chip.click();
    const widget = dashboard.widgetPanel.getByTestId('todos-momentum-widget');
    await d.expect(widget).toBeVisible();
    await d.expect(widget.getByTestId('todos-momentum-done')).toHaveText('2');
    await d.expect(widget.getByTestId('todos-momentum-streak')).toHaveText('1');
    // One day is not a habit yet: the flame stays unlit.
    await d.expect(widget.getByTestId('todos-momentum-flame')).toBeVisible();
    await d.expect(widget.locator('[data-testid="todos-momentum-flame"][data-hot="true"]')).toHaveCount(0);
  });

  test('with nothing finished this week the chip has nothing to say', async () => {
    const { token } = await h.loginAs(h.member);
    await createTodo(token, { title: 'Fix the gate', status: 'pending' });

    const d = h.driver;
    const dashboard = new DashboardPage(d);
    await d.goto('/dashboard');
    await d.expect(dashboard.agenticHome).toBeVisible();
    await d.expect(dashboard.strip).toBeVisible();
    await d.expect(dashboard.widgetChip('todos-momentum')).toHaveCount(0);
  });
});
