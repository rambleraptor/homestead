/**
 * Events module E2E — CRUD via the UI plus backend assertions.
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { EventsPage } from '../../pages/EventsPage';
import {
  createEvent,
  createPerson,
  deleteAllEvents,
  deleteAllPeople,
  deleteAllPersonSharedData,
  listEvents,
} from '../../utils/aepbase-helpers';

test.describe('Events CRUD', () => {
  let eventsPage: EventsPage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    eventsPage = new EventsPage(authenticatedPage);
    await deleteAllEvents(userToken);
    await deleteAllPersonSharedData(userToken);
    await deleteAllPeople(userToken);
    await eventsPage.goto();
  });

  test('creates a new event with a tag and a tagged person', async ({
    userToken,
  }) => {
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

  test('edits an existing event', async ({ userToken }) => {
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
    expect(updated?.date.substring(0, 10)).toBe('1990-07-21');
  });

  test('deletes an event', async ({ userToken }) => {
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

  test('tags multiple people on an anniversary event', async ({
    userToken,
  }) => {
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
