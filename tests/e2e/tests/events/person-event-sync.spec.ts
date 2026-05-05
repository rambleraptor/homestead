/**
 * Verifies the dual-write that runs when a person is created via the UI:
 * a birthday and (if present) anniversary should also exist as event records.
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { PeoplePage } from '../../pages/PeoplePage';
import {
  deleteAllEvents,
  deleteAllPeople,
  deleteAllPersonSharedData,
  listEvents,
} from '../../utils/aepbase-helpers';

test.describe('Person → event dual-write', () => {
  let peoplePage: PeoplePage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    peoplePage = new PeoplePage(authenticatedPage);
    await deleteAllEvents(userToken);
    await deleteAllPersonSharedData(userToken);
    await deleteAllPeople(userToken);
    await peoplePage.goto();
  });

  test('creates a birthday event when a person is created with a birthday', async ({
    userToken,
  }) => {
    await peoplePage.createPerson({
      name: 'Sync Test Person',
      birthday: '1990-06-20',
    });

    const events = await listEvents(userToken);
    const birthday = events.find((e) => e.tag === 'birthday');
    expect(birthday).toBeDefined();
    expect(birthday!.name).toContain('Sync Test Person');
    expect(birthday!.date.substring(0, 10)).toBe('1990-06-20');
    expect(birthday!.people).toBeDefined();
    expect(birthday!.people!.length).toBe(1);
  });

  test('creates an anniversary event when a person is created with an anniversary', async ({
    userToken,
  }) => {
    await peoplePage.createPerson({
      name: 'Anni Test Person',
      anniversary: '2010-08-15',
    });

    const events = await listEvents(userToken);
    const anniversary = events.find((e) => e.tag === 'anniversary');
    expect(anniversary).toBeDefined();
    expect(anniversary!.date.substring(0, 10)).toBe('2010-08-15');
  });
});
