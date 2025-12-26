/**
 * People E2E Tests - CRUD Operations
 */

import { test, expect } from '../../fixtures/pocketbase.fixture';
import { PeoplePage } from '../../pages/PeoplePage';
import { testPeople } from '../../fixtures/test-data';
import { createPerson, deleteAllPeople, getPersonSharedData } from '../../utils/pocketbase-helpers';

test.describe('People CRUD', () => {
  let peoplePage: PeoplePage;

  test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
    peoplePage = new PeoplePage(authenticatedPage);

    // Clean up any existing people
    await deleteAllPeople(userPocketbase);

    await peoplePage.goto();
  });

  test('should create a new person', async () => {
    const personData = {
      name: 'John Doe',
      address: '123 Main St, Anytown, USA',
      birthday: '1990-01-15',
    };

    await peoplePage.createPerson(personData);

    await peoplePage.expectPersonInList(personData.name);
  });

  test('should edit an existing person', async ({ userPocketbase }) => {
    const created = await createPerson(userPocketbase, {
      name: 'Original Name',
      address: '123 Old St',
    });

    await peoplePage.goto();

    await peoplePage.editPerson('Original Name', {
      name: 'Updated Name',
      address: '456 New Ave',
    });

    // Check person record
    const updated = await userPocketbase.collection('people').getOne(created.id);
    expect(updated.name).toBe('Updated Name');

    // Check shared data
    const sharedData = await getPersonSharedData(userPocketbase, created.id);
    expect(sharedData?.address).toBe('456 New Ave');

    await peoplePage.expectPersonInList('Updated Name');
    await peoplePage.expectPersonNotInList('Original Name');
  });

  test('should delete a person', async ({ userPocketbase }) => {
    await createPerson(userPocketbase, {
      name: 'Person to Delete',
    });

    await peoplePage.goto();

    await peoplePage.deletePerson('Person to Delete');

    await peoplePage.expectPersonNotInList('Person to Delete');
  });

  test('should create multiple people', async () => {
    for (const personData of testPeople.slice(0, 3)) {
      await peoplePage.createPerson(personData);
    }

    for (const personData of testPeople.slice(0, 3)) {
      await peoplePage.expectPersonInList(personData.name);
    }
  });
});
