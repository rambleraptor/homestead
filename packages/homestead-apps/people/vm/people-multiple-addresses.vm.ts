/**
 * People Multiple Addresses, on the VM tier.
 *
 * A port of ../e2e/people-multiple-addresses.spec.ts. Each test boots from a
 * fresh copy of the template database, so there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient, listOrEmpty } from '../../../../tests/e2e/utils/aepbase-helpers';
import { PeoplePage } from '../e2e/PeoplePage';
import { createPerson, getPersonSharedData } from '../e2e/helpers';

interface AddressRecord {
  id: string;
  line1: string;
  shared_data_id?: string;
}

describe('People Multiple Addresses', () => {
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

  test('should add a second address to an existing person', async () => {
    const person = await createPerson(userToken, {
      name: 'John Doe',
      address: '123 Main St',
      createdByUserId: userId,
    });

    await peoplePage.goto();
    await peoplePage.expectPersonInList('John Doe');

    const editButton = h.driver.getByRole('button', { name: 'Edit John Doe' }).first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();
    await h.driver.locator('#name').waitFor({ state: 'visible' });

    const addAddressButton = h.driver.getByRole('button', { name: /add address/i });
    await addAddressButton.waitFor({ state: 'visible' });
    await addAddressButton.click();

    const secondAddressInput = h.driver.locator('#address-1-line1');
    await secondAddressInput.waitFor({ state: 'visible' });
    await secondAddressInput.fill('456 Oak Ave');

    const submitButton = h.driver.getByTestId('person-form-submit');
    await submitButton.click();
    await submitButton.waitFor({ state: 'hidden' });
    await h.driver.waitForNetworkIdle();

    const sharedData = await getPersonSharedData(userToken, person.id);
    expect(sharedData).not.toBeNull();
    if (!sharedData) throw new Error('Expected shared data to exist');

    const primaryAddress = await e2eClient(userToken)
      .collection<AddressRecord>('addresses')
      .get(sharedData.address_id!);
    expect(primaryAddress.line1).toBe('123 Main St');
    expect(primaryAddress.shared_data_id || undefined).toBeUndefined();

    // Additional addresses: list all then filter client-side.
    const allAddresses = await listOrEmpty<AddressRecord>(userToken, 'addresses');
    const additionalAddresses = allAddresses.filter(
      (a) => a.shared_data_id === sharedData.id,
    );
    expect(additionalAddresses.length).toBe(1);
    expect(additionalAddresses[0].line1).toBe('456 Oak Ave');
    expect(additionalAddresses[0].shared_data_id).toBe(sharedData.id);

    await peoplePage.expectPersonInList('John Doe');
    const editButton2 = h.driver.getByRole('button', { name: 'Edit John Doe' }).first();
    await editButton2.click();
    await h.driver.locator('#name').waitFor({ state: 'visible' });

    await h.driver.expect(h.driver.locator('#address-0-line1')).toHaveValue('123 Main St');
    await h.driver.expect(h.driver.locator('#address-1-line1')).toHaveValue('456 Oak Ave');
  });

  test('should create a person with multiple addresses from the start', async () => {
    await peoplePage.clickAddPerson();

    await h.driver.locator('#name').fill('Jane Smith');

    const addAddressButton = h.driver.getByRole('button', { name: /add address/i });
    await addAddressButton.click();
    await h.driver.locator('#address-0-line1').fill('789 Pine Blvd');

    await addAddressButton.click();
    await h.driver.locator('#address-1-line1').fill('321 Elm Dr');

    await peoplePage.submitPersonForm();
    await h.driver.waitForNetworkIdle();

    const people = await listOrEmpty<{ id: string; name: string }>(userToken, 'people');
    const jane = people.find((p) => p.name === 'Jane Smith');
    expect(jane).toBeDefined();
    if (!jane) throw new Error('Expected to find Jane Smith');

    const sharedData = await getPersonSharedData(userToken, jane.id);
    expect(sharedData).not.toBeNull();
    if (!sharedData) throw new Error('Expected shared data to exist');

    const primaryAddress = await e2eClient(userToken)
      .collection<AddressRecord>('addresses')
      .get(sharedData.address_id!);
    expect(primaryAddress.line1).toBe('789 Pine Blvd');

    const allAddresses = await listOrEmpty<AddressRecord>(userToken, 'addresses');
    const additionalAddresses = allAddresses.filter(
      (a) => a.shared_data_id === sharedData.id,
    );
    expect(additionalAddresses.length).toBe(1);
    expect(additionalAddresses[0].line1).toBe('321 Elm Dr');
  });

  test('should remove a second address', async () => {
    const person = await createPerson(userToken, {
      name: 'Bob Jones',
      address: '111 First St',
      createdByUserId: userId,
    });

    const sharedData = await getPersonSharedData(userToken, person.id);
    if (!sharedData) throw new Error('Expected shared data to exist');

    const secondAddress = await e2eClient(userToken).collection<AddressRecord>('addresses').create({
      line1: '222 Second St',
      shared_data_id: sharedData.id,
      created_by: `users/${userId}`,
    });

    await peoplePage.goto();

    const editButton = h.driver.getByRole('button', { name: 'Edit Bob Jones' }).first();
    await editButton.click();
    await h.driver.locator('#name').waitFor({ state: 'visible' });

    await h.driver.expect(h.driver.locator('#address-0-line1')).toHaveValue('111 First St');
    await h.driver.expect(h.driver.locator('#address-1-line1')).toHaveValue('222 Second St');

    const removeButton = h.driver.getByRole('button', { name: /remove address 2/i });
    await removeButton.click();

    await peoplePage.submitPersonForm();
    await h.driver.waitForNetworkIdle();

    const allAddresses = await listOrEmpty<AddressRecord>(userToken, 'addresses');
    void allAddresses.find((a) => a.id === secondAddress.id);

    const updatedSharedData = await getPersonSharedData(userToken, person.id);
    if (!updatedSharedData) throw new Error('Expected shared data to exist');

    const linkedAddresses = allAddresses.filter(
      (a) => a.shared_data_id === updatedSharedData.id,
    );
    expect(linkedAddresses.length).toBe(0);
  });
});
