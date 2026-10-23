/**
 * People CRUD, on the VM tier.
 *
 * A port of ../e2e/people-crud.spec.ts: same page object and seed helpers,
 * but the SPA runs in happy-dom against the server's in-process fetch handler.
 * Each test boots from a fresh copy of the template database, so there is no
 * cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { PeoplePage } from '../e2e/PeoplePage';
import { createPerson, getPersonSharedData, testPeople } from '../e2e/helpers';

describe('People CRUD', () => {
  let h: Harness;
  let peoplePage: PeoplePage;
  let userToken: string;
  let userId: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken, id: userId } = await h.loginAs(h.member));
    peoplePage = new PeoplePage(h.driver);
    await peoplePage.goto();
  });

  afterEach(async () => {
    await h.close();
  });

  test('should create a new person', async () => {
    const personData = {
      name: 'John Doe',
      address: '123 Main St, Anytown, USA',
    };

    await peoplePage.createPerson(personData);

    await peoplePage.expectPersonInList(personData.name);
  });

  test('should edit an existing person', async () => {
    const created = await createPerson(userToken, {
      name: 'Original Name',
      address: '123 Old St',
      createdByUserId: userId,
    });

    await peoplePage.goto();

    await peoplePage.editPerson('Original Name', {
      name: 'Updated Name',
      address: '456 New Ave',
    });

    // Check person record
    const updated = await e2eClient(userToken).collection<{ name: string }>('people').get(created.id);
    expect(updated.name).toBe('Updated Name');

    // Check shared data and address
    const sharedData = await getPersonSharedData(userToken, created.id);
    if (sharedData?.address_id) {
      const address = await e2eClient(userToken).collection<{ line1: string }>('addresses').get(sharedData.address_id);
      expect(address.line1).toBe('456 New Ave');
    } else {
      throw new Error('Expected shared data with address_id');
    }

    await peoplePage.expectPersonInList('Updated Name');
    await peoplePage.expectPersonNotInList('Original Name');
  });

  test('should delete a person', async () => {
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
