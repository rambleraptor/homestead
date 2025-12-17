/**
 * Events E2E Tests - CRUD Operations
 */

import { test, expect } from '../../fixtures/pocketbase.fixture';
import { EventsPage } from '../../pages/EventsPage';
import { testEvents, getFutureDate } from '../../fixtures/test-data';
import { createEvent, deleteAllEvents } from '../../utils/pocketbase-helpers';

test.describe('Events CRUD', () => {
  let eventsPage: EventsPage;

  test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
    eventsPage = new EventsPage(authenticatedPage);

    // Clean up any existing events
    await deleteAllEvents(userPocketbase);

    await eventsPage.goto();
  });

  test('should create a new one-time event', async ({ page }) => {
    const eventData = {
      name: 'Test Event',
      date: getFutureDate(10),
      recurring: false,
    };

    await eventsPage.createEvent(eventData);

    // Verify it appears in the list
    await eventsPage.expectEventInList(eventData.name);
  });

  test('should create a recurring yearly event', async ({ page }) => {
    const eventData = {
      name: "Test Birthday",
      date: '1990-05-15',
      recurring: true,
      recurrenceType: 'yearly' as const,
    };

    await eventsPage.createEvent(eventData);

    // Verify it appears in the list
    await eventsPage.expectEventInList(eventData.name);
  });

  test('should edit existing event', async ({ userPocketbase }) => {
    // Create an event via API
    await createEvent(userPocketbase, {
      name: 'Original Event',
      date: getFutureDate(20),
    });

    await eventsPage.goto();

    // Edit it
    await eventsPage.editEvent('Original Event', {
      name: 'Updated Event',
    });

    // Verify the updated name
    await eventsPage.expectEventInList('Updated Event');
    await eventsPage.expectEventNotInList('Original Event');
  });

  test('should delete an event', async ({ userPocketbase }) => {
    // Create an event via API
    await createEvent(userPocketbase, {
      name: 'Event to Delete',
      date: getFutureDate(15),
    });

    await eventsPage.goto();

    // Delete it
    await eventsPage.deleteEvent('Event to Delete');

    // Verify it's removed
    await eventsPage.expectEventNotInList('Event to Delete');
  });

  test('should create multiple events', async ({ page }) => {
    for (const eventData of testEvents.slice(0, 3)) {
      await eventsPage.createEvent(eventData);
    }

    // Verify all appear in the list
    for (const eventData of testEvents.slice(0, 3)) {
      await eventsPage.expectEventInList(eventData.name);
    }
  });
});
