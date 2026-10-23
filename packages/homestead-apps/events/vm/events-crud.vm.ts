/**
 * Events CRUD, on the VM tier.
 *
 * A port of ../e2e/events-crud.spec.ts: CRUD via the UI plus backend
 * assertions. Each test boots from a fresh copy of the template database, so
 * there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { EventsPage } from '../e2e/EventsPage';
import { createEvent, listEvents } from '../e2e/helpers';
import { createPerson } from '../../people/e2e/helpers';

describe('Events CRUD', () => {
  let h: Harness;
  let eventsPage: EventsPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    eventsPage = new EventsPage(h.driver);
    await eventsPage.goto();
  });

  afterEach(async () => {
    await h.close();
  });

  test('creates a new event with a tag and a tagged person', async () => {
    const alice = await createPerson(userToken, { name: 'Alice' });

    await eventsPage.goto();
    await eventsPage.createEvent({
      name: "Alice's Graduation",
      date: '2020-05-30',
      tag: 'graduation',
      personNames: [alice.name],
    });

    await eventsPage.expectEventInList("Alice's Graduation");

    const events = await listEvents(userToken);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: "Alice's Graduation",
      tag: 'graduation',
      people: [`people/${alice.id}`],
    });
  });

  test('edits an existing event', async () => {
    const original = await createEvent(userToken, {
      name: 'Test Event',
      date: '1990-06-20',
      tag: 'birthday',
    });

    await eventsPage.goto();
    await eventsPage.expectEventInList('Test Event');
    await eventsPage.editEvent('Test Event', {
      name: 'Updated Event',
      date: '1990-07-21',
    });

    await eventsPage.expectEventInList('Updated Event');

    const events = await listEvents(userToken);
    const updated = events.find((e) => e.id === original.id);
    expect(updated?.name).toBe('Updated Event');
    expect(updated?.month).toBe(7);
    expect(updated?.day).toBe(21);
  });

  test('deletes an event', async () => {
    await createEvent(userToken, {
      name: 'Doomed Event',
      date: '1990-06-20',
    });

    await eventsPage.goto();
    await eventsPage.expectEventInList('Doomed Event');
    await eventsPage.deleteEvent('Doomed Event');
    await eventsPage.expectEventNotInList('Doomed Event');

    const remaining = await listEvents(userToken);
    expect(remaining.find((e) => e.name === 'Doomed Event')).toBeUndefined();
  });

  test('creates a yearly Nth-weekday event (2nd Sunday of May)', async () => {
    // 2026-05-10 is the 2nd Sunday of May 2026 — pre-fills the rule.
    await eventsPage.goto();
    await eventsPage.createEvent({
      name: "Mother's Day",
      date: '2026-05-10',
      recurrence: { week: '2', weekday: '0' },
    });

    await eventsPage.expectEventInList("Mother's Day");

    const events = await listEvents(userToken);
    const created = events.find((e) => e.name === "Mother's Day");
    expect(created).toBeDefined();
    expect(created!.recurrence).toBe('yearly-nth-weekday');
    expect(created!.recurrence_rule).toBe('2:0');
  });

  test('filters events by name and by tag', async () => {
    await createEvent(userToken, {
      name: 'Alice Birthday',
      date: '1990-06-20',
      tag: 'birthday',
    });
    await createEvent(userToken, {
      name: 'Wedding Anniversary',
      date: '2010-08-15',
      tag: 'anniversary',
    });

    await eventsPage.goto();
    await eventsPage.expectEventInList('Alice Birthday');
    await eventsPage.expectEventInList('Wedding Anniversary');

    // Name filter narrows to the matching event.
    await eventsPage.filterByName('alice');
    await eventsPage.expectEventInList('Alice Birthday');
    await eventsPage.expectEventNotInList('Wedding Anniversary');

    // Clearing the name filter restores both, then filter by tag.
    await eventsPage.filterByName('');
    await eventsPage.expectEventInList('Wedding Anniversary');
    await eventsPage.toggleTagFilter('anniversary');
    await eventsPage.expectEventInList('Wedding Anniversary');
    await eventsPage.expectEventNotInList('Alice Birthday');
  });

  test('tags multiple people on an anniversary event', async () => {
    const alice = await createPerson(userToken, { name: 'Alice' });
    const bob = await createPerson(userToken, { name: 'Bob' });

    await eventsPage.goto();
    await eventsPage.createEvent({
      name: "Alice & Bob's Anniversary",
      date: '2010-08-15',
      tag: 'anniversary',
      personNames: [alice.name, bob.name],
    });

    const events = await listEvents(userToken);
    const created = events.find(
      (e) => e.name === "Alice & Bob's Anniversary",
    );
    expect(created).toBeDefined();
    expect(created!.people?.sort()).toEqual(
      [`people/${alice.id}`, `people/${bob.id}`].sort(),
    );
  });
});
