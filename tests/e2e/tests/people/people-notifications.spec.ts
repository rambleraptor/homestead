/**
 * People E2E Tests - Notification Preferences
 *
 * Tests the notification preference system including:
 * - Setting notification preferences when creating a person
 * - Updating notification preferences
 * - Verifying notification_preferences field is set correctly on person records
 *
 * Note: These tests verify the legacy notification_preferences field on people.
 * New people use this field for notifications until a future migration converts
 * them to the recurring_notifications system.
 */

import { test, expect } from '../../fixtures/pocketbase.fixture';
import { PeoplePage } from '../../pages/PeoplePage';
import {
  createPerson,
  deleteAllPeople,
  deleteAllRecurringNotifications
} from '../../utils/pocketbase-helpers';

test.describe('People Notification Preferences', () => {
  let peoplePage: PeoplePage;

  test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
    peoplePage = new PeoplePage(authenticatedPage);

    // Clean up any existing people and recurring notifications
    await deleteAllPeople(userPocketbase);
    await deleteAllRecurringNotifications(userPocketbase);

    await peoplePage.goto();
  });

  test('should save notification preferences when creating person with birthday', async ({ userPocketbase }) => {
    const personData = {
      name: 'John Birthday',
      birthday: '1990-06-15',
      notificationPreferences: ['day_of', 'week_before'] as const,
    };

    await peoplePage.createPersonWithNotifications(personData);
    await peoplePage.expectPersonInList(personData.name);

    // Verify person was created with correct notification_preferences
    const people = await userPocketbase.collection('people').getFullList({
      filter: `name = "${personData.name}"`,
    });
    expect(people.length).toBe(1);

    // Verify notification_preferences field contains the expected values
    const prefs = people[0].notification_preferences;
    expect(prefs).toBeDefined();
    expect(Array.isArray(prefs)).toBe(true);
    expect(prefs.sort()).toEqual(['day_of', 'week_before'].sort());
  });

  test('should save notification preferences for person with both birthday and anniversary', async ({ userPocketbase }) => {
    const personData = {
      name: 'Jane Both',
      birthday: '1985-03-20',
      anniversary: '2010-07-04',
      notificationPreferences: ['day_before'] as const,
    };

    await peoplePage.createPersonWithNotifications(personData);
    await peoplePage.expectPersonInList(personData.name);

    // Verify person was created
    const people = await userPocketbase.collection('people').getFullList({
      filter: `name = "${personData.name}"`,
    });
    expect(people.length).toBe(1);

    // Verify notification_preferences field
    const prefs = people[0].notification_preferences;
    expect(prefs).toBeDefined();
    expect(prefs).toEqual(['day_before']);

    // Verify dates were saved
    expect(people[0].birthday).toBe('1985-03-20');
    expect(people[0].anniversary).toBe('2010-07-04');
  });

  test('should update notification preferences when editing person', async ({ userPocketbase }) => {
    // Create person with initial preferences
    const created = await createPerson(userPocketbase, {
      name: 'Update Test',
      birthday: '1995-12-25',
      notification_preferences: ['day_of'],
    });

    await peoplePage.goto();

    // Edit and change notification preferences
    await peoplePage.editPersonNotifications('Update Test', ['day_before', 'week_before']);

    // Verify notification_preferences were updated
    const updated = await userPocketbase.collection('people').getOne(created.id);
    const prefs = updated.notification_preferences;
    expect(prefs).toBeDefined();
    expect(Array.isArray(prefs)).toBe(true);
    expect(prefs.sort()).toEqual(['day_before', 'week_before'].sort());
  });

  test('should save notification preferences even when no dates are set', async ({ userPocketbase }) => {
    const personData = {
      name: 'No Dates Person',
      notificationPreferences: ['day_of', 'day_before', 'week_before'] as const,
    };

    await peoplePage.createPersonWithNotifications(personData);
    await peoplePage.expectPersonInList(personData.name);

    // Verify person was created
    const people = await userPocketbase.collection('people').getFullList({
      filter: `name = "${personData.name}"`,
    });
    expect(people.length).toBe(1);

    // Verify notification_preferences are saved (even without dates)
    const prefs = people[0].notification_preferences;
    expect(prefs).toBeDefined();
    expect(Array.isArray(prefs)).toBe(true);
    expect(prefs.sort()).toEqual(['day_before', 'day_of', 'week_before']);
  });

  test('should clear notification preferences when all are removed', async ({ userPocketbase }) => {
    // Create person with preferences
    const personData = {
      name: 'Clear Prefs Test',
      birthday: '1990-05-05',
      notificationPreferences: ['day_of', 'day_before', 'week_before'] as const,
    };

    await peoplePage.createPersonWithNotifications(personData);

    // Verify person was created with preferences
    const people = await userPocketbase.collection('people').getFullList({
      filter: `name = "${personData.name}"`,
    });
    expect(people.length).toBe(1);
    expect(people[0].notification_preferences.length).toBe(3);

    // Edit and clear all preferences
    await peoplePage.editPersonNotifications('Clear Prefs Test', []);

    // Verify notification_preferences were cleared
    const updated = await userPocketbase.collection('people').getOne(people[0].id);
    const prefs = updated.notification_preferences;
    expect(prefs).toEqual([]);
  });

  test('should delete person successfully', async ({ userPocketbase }) => {
    // Create person
    await createPerson(userPocketbase, {
      name: 'Delete Test',
      birthday: '2000-01-01',
      notification_preferences: ['day_of'],
    });

    // Delete the person
    await peoplePage.goto();
    await peoplePage.deletePerson('Delete Test');

    // Verify person was deleted
    const people = await userPocketbase.collection('people').getFullList({
      filter: `name = "Delete Test"`,
    });
    expect(people.length).toBe(0);
  });
});
