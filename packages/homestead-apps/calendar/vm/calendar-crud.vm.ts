/**
 * Calendar flows, on the VM tier: calendars, one-off and repeating events, and
 * the "this one or all of them" choices a repeating event brings.
 *
 * Each test boots from a fresh database, so there are no calendars to start
 * with and nothing to clean up. Dates are relative to today so the suite
 * doesn't rot; anything spanning several days is checked in the agenda, whose
 * thirty days always hold them (a month grid may end tomorrow).
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { createEvent as createYearlyEvent } from '../../events/e2e/helpers';
import { CalendarPage } from '../e2e/CalendarPage';
import {
  createCalendar,
  createCalendarEvent,
  instantDaysFromToday,
  isoDaysFromToday,
  listCalendarEvents,
  listCalendars,
} from '../e2e/helpers';

describe('Calendar', () => {
  let h: Harness;
  let calendarPage: CalendarPage;
  let userToken: string;

  // Seeding happens BEFORE the single per-test navigation, so the UI renders
  // the seeded state without a reload.
  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    calendarPage = new CalendarPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  const today = isoDaysFromToday(0);

  async function seedWeekly(calendarId: string) {
    return createCalendarEvent(userToken, calendarId, {
      title: 'Swimming',
      all_day: true,
      start: today,
      end: today,
      rrule: 'FREQ=WEEKLY',
    });
  }

  test('starts empty and creates the first calendar', async () => {
    await calendarPage.goto();
    await calendarPage.expectEmptyState();

    await calendarPage.openCalendarsFromEmptyState();
    // The first calendar is suggested as "Family".
    await h.driver.getByTestId('calendar-form-submit').click();
    await h.driver.expect(calendarPage.legendItem('Family')).toBeVisible();

    const stored = await listCalendars(userToken);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ name: 'Family', color: 'blue' });
  });

  test('creates a timed event on today', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });

    await calendarPage.goto();
    await calendarPage.createEvent({
      title: 'Dentist',
      startTime: '09:00',
      endTime: '10:00',
      location: '12 Oak St',
    });

    await calendarPage.expectEventOn(today, 'Dentist');

    const stored = await listCalendarEvents(userToken, family.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      title: 'Dentist',
      all_day: false,
      start: instantDaysFromToday(0, 9),
      end: instantDaysFromToday(0, 10),
      location: '12 Oak St',
    });
    expect(stored[0]!.timezone).toBeTruthy();
  });

  test('starts a new event on the day that was tapped', async () => {
    await createCalendar(userToken, { name: 'Family' });

    await calendarPage.goto();
    await calendarPage.clickAddOn(today);
    await h.driver.expect(h.driver.locator('#calendar-event-start-day')).toHaveValue(today);
  });

  test('shows a multi-day all-day event on each of its days', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });
    await createCalendarEvent(userToken, family.id, {
      title: 'Camping',
      all_day: true,
      start: isoDaysFromToday(2),
      end: isoDaysFromToday(4),
    });

    await calendarPage.goto();
    await calendarPage.showView('agenda');

    await calendarPage.expectEventOn(isoDaysFromToday(2), 'Camping');
    await calendarPage.expectEventOn(isoDaysFromToday(3), 'Camping');
    await calendarPage.expectEventOn(isoDaysFromToday(4), 'Camping');
    await calendarPage.expectEventCount('Camping', 3);
  });

  test('creates a repeating event with an end date', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });

    await calendarPage.goto();
    await calendarPage.showView('agenda');
    await calendarPage.createEvent({
      title: 'Take medicine',
      allDay: true,
      repeat: 'daily',
      untilDay: isoDaysFromToday(2),
    });

    await calendarPage.expectEventCount('Take medicine', 3);

    const stored = await listCalendarEvents(userToken, family.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.rrule).toBe(`FREQ=DAILY;UNTIL=${isoDaysFromToday(2).replaceAll('-', '')}`);
  });

  test('edits a one-off event', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });
    await createCalendarEvent(userToken, family.id, {
      title: 'Dentist',
      start: instantDaysFromToday(0, 9),
      end: instantDaysFromToday(0, 10),
    });

    await calendarPage.goto();
    await calendarPage.openEvent(today, 'Dentist');
    await calendarPage.editOpenEvent({ title: 'Orthodontist', notes: 'Bring the retainer' });

    await calendarPage.expectEventOn(today, 'Orthodontist');
    const stored = await listCalendarEvents(userToken, family.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ title: 'Orthodontist', notes: 'Bring the retainer' });
  });

  test('deletes a one-off event', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });
    await createCalendarEvent(userToken, family.id, {
      title: 'Dentist',
      start: instantDaysFromToday(0, 9),
      end: instantDaysFromToday(0, 10),
    });

    await calendarPage.goto();
    await calendarPage.openEvent(today, 'Dentist');
    await calendarPage.deleteOpenEvent();

    await calendarPage.expectNoEventOn(today, 'Dentist');
    expect(await listCalendarEvents(userToken, family.id)).toHaveLength(0);
  });

  test('skips one occurrence of a repeating event and keeps the rest', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });
    await seedWeekly(family.id);

    await calendarPage.goto();
    await calendarPage.showView('agenda');
    await calendarPage.expectEventOn(isoDaysFromToday(7), 'Swimming');

    await calendarPage.openEvent(isoDaysFromToday(7), 'Swimming');
    await calendarPage.expectDetails('Every week');
    await calendarPage.deleteOpenEvent('one');

    await calendarPage.expectEventOn(today, 'Swimming');
    await calendarPage.expectEventOn(isoDaysFromToday(14), 'Swimming');
    await calendarPage.expectEventCount('Swimming', 4);

    const stored = await listCalendarEvents(userToken, family.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.exdates).toEqual([isoDaysFromToday(7)]);
  });

  test('changes one occurrence of a repeating event without touching the rest', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });
    const series = await seedWeekly(family.id);

    await calendarPage.goto();
    await calendarPage.showView('agenda');
    await calendarPage.openEvent(isoDaysFromToday(7), 'Swimming');
    await calendarPage.editOpenEvent({ title: 'Swimming gala' }, 'one');

    await calendarPage.expectEventOn(isoDaysFromToday(7), 'Swimming gala');
    await calendarPage.expectEventCount('Swimming gala', 1);
    await calendarPage.expectEventOn(today, 'Swimming');
    await calendarPage.expectEventOn(isoDaysFromToday(14), 'Swimming');

    const stored = await listCalendarEvents(userToken, family.id);
    expect(stored).toHaveLength(2);
    const changed = stored.find((e) => e.title === 'Swimming gala')!;
    expect(changed.original_start).toBe(isoDaysFromToday(7));
    expect(changed.series).toContain(series.id);
    expect(changed.rrule ?? '').toBe('');
  });

  test('edits every occurrence of a repeating event at once', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });
    await seedWeekly(family.id);

    await calendarPage.goto();
    await calendarPage.showView('agenda');
    await calendarPage.openEvent(isoDaysFromToday(7), 'Swimming');
    await calendarPage.editOpenEvent({ title: 'Swim club' }, 'all');

    await calendarPage.expectEventOn(today, 'Swim club');
    await calendarPage.expectEventOn(isoDaysFromToday(7), 'Swim club');
    await calendarPage.expectEventCount('Swimming', 0);

    const stored = await listCalendarEvents(userToken, family.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ title: 'Swim club', start: today, rrule: 'FREQ=WEEKLY' });
  });

  test('deletes a whole repeating event', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });
    await seedWeekly(family.id);

    await calendarPage.goto();
    await calendarPage.showView('agenda');
    await calendarPage.openEvent(isoDaysFromToday(7), 'Swimming');
    await calendarPage.deleteOpenEvent('all');

    await calendarPage.expectEventCount('Swimming', 0);
    expect(await listCalendarEvents(userToken, family.id)).toHaveLength(0);
  });

  test('shows validation messages instead of saving a bad event', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });

    await calendarPage.goto();
    await calendarPage.clickNewEvent();
    await calendarPage.fillEventForm({ endDay: isoDaysFromToday(-1) });
    await calendarPage.clickSubmitEvent();

    await calendarPage.expectFormError('Give the event a title.');
    await calendarPage.expectFormError('The end can’t be before the start.');
    expect(await listCalendarEvents(userToken, family.id)).toHaveLength(0);
  });

  test('hides a calendar’s events when it is switched off in the legend', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });
    const school = await createCalendar(userToken, { name: 'School', color: 'green' });
    await createCalendarEvent(userToken, family.id, {
      title: 'Dinner out',
      all_day: true,
      start: today,
      end: today,
    });
    await createCalendarEvent(userToken, school.id, {
      title: 'Book fair',
      all_day: true,
      start: today,
      end: today,
    });

    await calendarPage.goto();
    await calendarPage.expectEventOn(today, 'Dinner out');
    await calendarPage.expectEventOn(today, 'Book fair');

    await calendarPage.toggleCalendar('School');
    await calendarPage.expectNoEventOn(today, 'Book fair');
    await calendarPage.expectEventOn(today, 'Dinner out');

    await calendarPage.toggleCalendar('School');
    await calendarPage.expectEventOn(today, 'Book fair');
  });

  test('puts a new event on the calendar chosen in the form', async () => {
    await createCalendar(userToken, { name: 'Family' });
    const school = await createCalendar(userToken, { name: 'School', color: 'green' });

    await calendarPage.goto();
    await calendarPage.createEvent({ title: 'Book fair', calendar: 'School', allDay: true });

    await calendarPage.expectEventOn(today, 'Book fair');
    const stored = await listCalendarEvents(userToken, school.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ title: 'Book fair', all_day: true, start: today, end: today });
  });

  test('deletes a calendar along with its events', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });
    const school = await createCalendar(userToken, { name: 'School', color: 'green' });
    await createCalendarEvent(userToken, school.id, {
      title: 'Book fair',
      all_day: true,
      start: today,
      end: today,
    });

    await calendarPage.goto();
    await calendarPage.expectEventOn(today, 'Book fair');
    await calendarPage.openCalendars();
    await calendarPage.deleteCalendar('School');

    await h.driver.expect(calendarPage.calendarRow('School')).toHaveCount(0);
    await calendarPage.expectEventCount('Book fair', 0);
    const stored = await listCalendars(userToken);
    expect(stored.map((c) => c.id)).toEqual([family.id]);
  });

  test('shows a birthday from the Events app on its day', async () => {
    await createCalendar(userToken, { name: 'Family' });
    await createYearlyEvent(userToken, { name: 'Sam’s birthday', date: today, tag: 'birthday' });

    await calendarPage.goto();

    await h.driver
      .expect(
        calendarPage.day(today).getByTestId('calendar-yearly-date').filter({ hasText: 'Sam’s birthday' }),
      )
      .toBeVisible();
  });

  test('queues a reminder for someone who asked, as soon as an event is added', async () => {
    const family = await createCalendar(userToken, { name: 'Family' });
    const queue = () =>
      e2eClient(userToken)
        .collection('users')
        .record(h.member.id)
        .collection<{ title: string; send_at: string; source_app: string }>('scheduled-notifications')
        .listAll();

    await calendarPage.goto();
    const toggle = h.driver.getByTestId('calendar-reminder-toggle');
    await toggle.click();
    await h.driver.expect(toggle).toContainText('Reminding me');

    // Three hours out, so the reminder (30 minutes before) is still to come.
    const start = new Date(Date.now() + 3 * 3_600_000);
    await createCalendarEvent(userToken, family.id, {
      title: 'Dentist',
      start: start.toISOString(),
      end: new Date(start.getTime() + 3_600_000).toISOString(),
    });

    await expect
      .poll(async () => (await queue()).map((n) => n.title))
      .toEqual(['Soon: Dentist']);
    const [queued] = await queue();
    expect(queued).toMatchObject({ source_app: 'calendar' });
    expect(new Date(queued!.send_at).getTime()).toBe(start.getTime() - 30 * 60_000);
  });
});
