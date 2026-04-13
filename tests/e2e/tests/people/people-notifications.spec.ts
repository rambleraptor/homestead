/**
 * People E2E Tests - Notification Preferences
 *
 * Verifies the recurring-notifications records created when a person is
 * created or updated with notification timings. The aepbase `person`
 * schema doesn't store `notification_preferences` anymore (the field is
 * declared on the schema only for backward-compat and is populated only
 * via the recurring-notifications sync).
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { PeoplePage } from '../../pages/PeoplePage';
import {
  aepList,
  createPerson,
  deleteAllPeople,
  deleteAllRecurringNotifications,
  getRecurringNotificationsForPerson,
} from '../../utils/aepbase-helpers';

interface PersonRow {
  id: string;
  name: string;
}

test.describe('People Notification Preferences', () => {
  let peoplePage: PeoplePage;

  test.beforeEach(async ({ authenticatedPage, userToken, userId }) => {
    peoplePage = new PeoplePage(authenticatedPage);
    await deleteAllPeople(userToken);
    await deleteAllRecurringNotifications(userToken, userId);
    await peoplePage.goto();
  });

  test('should save notification preferences when creating person with birthday', async ({ userToken, userId }) => {
    const personData = {
      name: 'John Birthday',
      birthday: '1990-06-15',
      notificationPreferences: ['day_of', 'week_before'] as Array<'day_of' | 'day_before' | 'week_before'>,
    };

    await peoplePage.createPersonWithNotifications(personData);
    await peoplePage.expectPersonInList(personData.name);

    const people = await aepList<PersonRow>(userToken, 'people');
    const john = people.find((p) => p.name === personData.name);
    expect(john).toBeDefined();

    const rns = await getRecurringNotificationsForPerson(userToken, userId, john!.id);
    const birthdayRns = rns.filter((r) => r.reference_date_field === 'birthday');
    expect(birthdayRns.map((r) => r.timing).sort()).toEqual(['day_of', 'week_before']);
  });

  test('should save notification preferences for person with both birthday and anniversary', async ({ userToken, userId }) => {
    const personData = {
      name: 'Jane Both',
      birthday: '1985-03-20',
      anniversary: '2010-07-04',
      notificationPreferences: ['day_before'] as Array<'day_of' | 'day_before' | 'week_before'>,
    };

    await peoplePage.createPersonWithNotifications(personData);
    await peoplePage.expectPersonInList(personData.name);

    const people = await aepList<PersonRow>(userToken, 'people');
    const jane = people.find((p) => p.name === personData.name);
    expect(jane).toBeDefined();

    const rns = await getRecurringNotificationsForPerson(userToken, userId, jane!.id);
    expect(rns.some((r) => r.reference_date_field === 'birthday' && r.timing === 'day_before')).toBe(true);
    expect(rns.some((r) => r.reference_date_field === 'anniversary' && r.timing === 'day_before')).toBe(true);
  });

  test('should update notification preferences when editing person', async ({ userToken, userId }) => {
    const created = await createPerson(userToken, {
      name: 'Update Test',
      birthday: '1995-12-25',
    });

    await peoplePage.goto();
    await peoplePage.editPersonNotifications('Update Test', ['day_before', 'week_before']);

    const rns = await getRecurringNotificationsForPerson(userToken, userId, created.id);
    const birthdayRns = rns.filter((r) => r.reference_date_field === 'birthday');
    expect(birthdayRns.map((r) => r.timing).sort()).toEqual(['day_before', 'week_before']);
  });

  test('should clear notification preferences when all are removed', async ({ userToken, userId }) => {
    const personData = {
      name: 'Clear Prefs Test',
      birthday: '1990-05-05',
      notificationPreferences: ['day_of', 'day_before', 'week_before'] as Array<'day_of' | 'day_before' | 'week_before'>,
    };

    await peoplePage.createPersonWithNotifications(personData);

    const people = await aepList<PersonRow>(userToken, 'people');
    const clearPrefs = people.find((p) => p.name === personData.name);
    expect(clearPrefs).toBeDefined();

    const initial = await getRecurringNotificationsForPerson(userToken, userId, clearPrefs!.id);
    expect(initial.filter((r) => r.reference_date_field === 'birthday').length).toBe(3);

    await peoplePage.editPersonNotifications('Clear Prefs Test', []);

    const after = await getRecurringNotificationsForPerson(userToken, userId, clearPrefs!.id);
    expect(after.length).toBe(0);
  });

  test('should delete person successfully', async ({ userToken }) => {
    await createPerson(userToken, {
      name: 'Delete Test',
      birthday: '2000-01-01',
    });

    await peoplePage.goto();
    await peoplePage.deletePerson('Delete Test');

    const people = await aepList<PersonRow>(userToken, 'people');
    expect(people.find((p) => p.name === 'Delete Test')).toBeUndefined();
  });
});
