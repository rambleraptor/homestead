/**
 * People E2E Tests - CRUD Operations
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { PeoplePage } from '../../pages/PeoplePage';
import { testPeople } from '../../fixtures/test-data';
import {
  createPerson,
  deleteAllPeople,
  getPersonSharedData,
  aepGet,
} from '../../utils/aepbase-helpers';

test.describe('People CRUD', () => {
  let peoplePage: PeoplePage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    peoplePage = new PeoplePage(authenticatedPage);

    // Clean up any existing people
    await deleteAllPeople(userToken);

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

  test('should edit an existing person', async ({ userToken }) => {
    const created = await createPerson(userToken, {
      name: 'Original Name',
      address: '123 Old St',
    });

    await peoplePage.goto();

    await peoplePage.editPerson('Original Name', {
      name: 'Updated Name',
      address: '456 New Ave',
    });

    // Check person record
    const updated = await aepGet<{ name: string }>(userToken, 'people', created.id);
    expect(updated.name).toBe('Updated Name');

    // Check shared data and address
    const sharedData = await getPersonSharedData(userToken, created.id);
    if (sharedData?.address_id) {
      const address = await aepGet<{ line1: string }>(userToken, 'addresses', sharedData.address_id);
      expect(address.line1).toBe('456 New Ave');
    } else {
      throw new Error('Expected shared data with address_id');
    }

    await peoplePage.expectPersonInList('Updated Name');
    await peoplePage.expectPersonNotInList('Original Name');
  });

  test('should delete a person', async ({ userToken }) => {
    await createPerson(userToken, {
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
