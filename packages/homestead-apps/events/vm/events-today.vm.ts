/**
 * An event on its day, on the VM tier: the list card and the dashboard's
 * upcoming-events widget wear the Today badge with the person's age, and the
 * home's chip strip leads with it. An event later in the week gets no badge,
 * and the chip only says when it's next.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { DashboardPage } from '../../../../tests/e2e/pages/DashboardPage';
import { EventsPage } from '../e2e/EventsPage';
import { createEvent } from '../e2e/helpers';
import { createPerson } from '../../people/e2e/helpers';

/** `YYYY-MM-DD` in local time, `daysFromNow` days out, in the given year. */
function localDate(daysFromNow: number, year?: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  const y = year ?? d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const BIRTH_YEAR_AGO = 30;

describe('Events — the day itself', () => {
  let h: Harness;
  let eventsPage: EventsPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    eventsPage = new EventsPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('a birthday today wears the Today badge with the age, on the list and the widget', async () => {
    const sam = await createPerson(userToken, { name: 'Sam' });
    const birthYear = new Date().getFullYear() - BIRTH_YEAR_AGO;
    const birthday = await createEvent(userToken, {
      name: "Sam's Birthday",
      date: localDate(0, birthYear),
      withYear: true,
      tag: 'birthday',
      personIds: [sam.id],
    });

    await eventsPage.goto();
    await eventsPage.expectTodayBadge(birthday.id, 'Today');
    await eventsPage.expectTodayBadge(birthday.id, `Turning ${BIRTH_YEAR_AGO}`);

    const dashboard = new DashboardPage(h.driver);
    await dashboard.goto();
    const chip = dashboard.widgetChip('events-upcoming');
    await h.driver.expect(chip).toContainText("Sam's birthday today");
    await h.driver.expect(chip).toHaveAttribute('data-urgent', 'true');

    await chip.click();
    const badge = eventsPage.widgetTodayBadge(birthday.id);
    await h.driver.expect(badge).toBeVisible();
    await h.driver.expect(badge).toContainText(`Turning ${BIRTH_YEAR_AGO}`);
  });

  test('an anniversary today counts the years', async () => {
    const weddingYear = new Date().getFullYear() - 10;
    const anniversary = await createEvent(userToken, {
      name: 'Wedding Anniversary',
      date: localDate(0, weddingYear),
      withYear: true,
      tag: 'anniversary',
    });

    await eventsPage.goto();
    await eventsPage.expectTodayBadge(anniversary.id, '10 years');
  });

  test('an event later this week gets no badge; the chip says when it is next', async () => {
    const sam = await createPerson(userToken, { name: 'Sam' });
    const soon = await createEvent(userToken, {
      name: "Sam's Birthday",
      date: localDate(3),
      tag: 'birthday',
      personIds: [sam.id],
    });

    await eventsPage.goto();
    await eventsPage.expectNoTodayBadge(soon.id);

    const dashboard = new DashboardPage(h.driver);
    await dashboard.goto();
    const chip = dashboard.widgetChip('events-upcoming');
    await h.driver.expect(chip).toContainText("Next: Sam's birthday in 3 days");
    // Not urgent: the chip reads as plain, not as today's.
    expect(await chip.getAttribute('data-urgent')).toBeNull();
  });
});
