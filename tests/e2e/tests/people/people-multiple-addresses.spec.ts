/**
 * People E2E Tests - Multiple Addresses
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { PeoplePage } from '../../pages/PeoplePage';
import {
  aepCreate,
  aepGet,
  aepList,
  createPerson,
  deleteAllPeople,
  getPersonSharedData,
} from '../../utils/aepbase-helpers';

interface AddressRecord {
  id: string;
  line1: string;
  shared_data_id?: string;
}

test.describe('People Multiple Addresses', () => {
  let peoplePage: PeoplePage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    peoplePage = new PeoplePage(authenticatedPage);
    await deleteAllPeople(userToken);
    await peoplePage.goto();
  });

  test('should add a second address to an existing person', async ({ authenticatedPage, userToken, userId }) => {
    const person = await createPerson(userToken, {
      name: 'John Doe',
      address: '123 Main St',
      createdByUserId: userId,
    });

    await peoplePage.goto();
    await peoplePage.expectPersonInList('John Doe');

    const editButton = authenticatedPage.getByRole('button', { name: 'Edit John Doe' }).first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();
    await authenticatedPage.locator('#name').waitFor({ state: 'visible' });

    const addAddressButton = authenticatedPage.getByRole('button', { name: /add address/i });
    await addAddressButton.waitFor({ state: 'visible' });
    await addAddressButton.click();

    const secondAddressInput = authenticatedPage.locator('#address-1-line1');
    await secondAddressInput.waitFor({ state: 'visible' });
    await secondAddressInput.fill('456 Oak Ave');

    const submitButton = authenticatedPage.getByTestId('person-form-submit');
    await submitButton.click();
    await submitButton.waitFor({ state: 'hidden' });
    await authenticatedPage.waitForLoadState('networkidle');

    const sharedData = await getPersonSharedData(userToken, person.id);
    expect(sharedData).not.toBeNull();
    if (!sharedData) throw new Error('Expected shared data to exist');

    const primaryAddress = await aepGet<AddressRecord>(
      userToken,
      'addresses',
      sharedData.address_id!,
    );
    expect(primaryAddress.line1).toBe('123 Main St');
    expect(primaryAddress.shared_data_id || undefined).toBeUndefined();

    // Additional addresses: list all then filter client-side.
    const allAddresses = await aepList<AddressRecord>(userToken, 'addresses');
    const additionalAddresses = allAddresses.filter(
      (a) => a.shared_data_id === sharedData.id,
    );
    expect(additionalAddresses.length).toBe(1);
    expect(additionalAddresses[0].line1).toBe('456 Oak Ave');
    expect(additionalAddresses[0].shared_data_id).toBe(sharedData.id);

    await peoplePage.expectPersonInList('John Doe');
    const editButton2 = authenticatedPage.getByRole('button', { name: 'Edit John Doe' }).first();
    await editButton2.click();
    await authenticatedPage.locator('#name').waitFor({ state: 'visible' });

    await expect(authenticatedPage.locator('#address-0-line1')).toHaveValue('123 Main St');
    await expect(authenticatedPage.locator('#address-1-line1')).toHaveValue('456 Oak Ave');
  });

  test('should create a person with multiple addresses from the start', async ({ authenticatedPage, userToken }) => {
    await peoplePage.clickAddPerson();

    await authenticatedPage.locator('#name').fill('Jane Smith');

    const addAddressButton = authenticatedPage.getByRole('button', { name: /add address/i });
    await addAddressButton.click();
    await authenticatedPage.locator('#address-0-line1').fill('789 Pine Blvd');

    await addAddressButton.click();
    await authenticatedPage.locator('#address-1-line1').fill('321 Elm Dr');

    await peoplePage.submitPersonForm();
    await authenticatedPage.waitForLoadState('networkidle');

    const people = await aepList<{ id: string; name: string }>(userToken, 'people');
    const jane = people.find((p) => p.name === 'Jane Smith');
    expect(jane).toBeDefined();
    if (!jane) throw new Error('Expected to find Jane Smith');

    const sharedData = await getPersonSharedData(userToken, jane.id);
    expect(sharedData).not.toBeNull();
    if (!sharedData) throw new Error('Expected shared data to exist');

    const primaryAddress = await aepGet<AddressRecord>(
      userToken,
      'addresses',
      sharedData.address_id!,
    );
    expect(primaryAddress.line1).toBe('789 Pine Blvd');

    const allAddresses = await aepList<AddressRecord>(userToken, 'addresses');
    const additionalAddresses = allAddresses.filter(
      (a) => a.shared_data_id === sharedData.id,
    );
    expect(additionalAddresses.length).toBe(1);
    expect(additionalAddresses[0].line1).toBe('321 Elm Dr');
  });

  test('should remove a second address', async ({ authenticatedPage, userToken, userId }) => {
    const person = await createPerson(userToken, {
      name: 'Bob Jones',
      address: '111 First St',
      createdByUserId: userId,
    });

    const sharedData = await getPersonSharedData(userToken, person.id);
    if (!sharedData) throw new Error('Expected shared data to exist');

    const secondAddress = await aepCreate<AddressRecord>(userToken, 'addresses', {
      line1: '222 Second St',
      shared_data_id: sharedData.id,
      created_by: `users/${userId}`,
    });

    await peoplePage.goto();

    const editButton = authenticatedPage.getByRole('button', { name: 'Edit Bob Jones' }).first();
    await editButton.click();
    await authenticatedPage.locator('#name').waitFor({ state: 'visible' });

    await expect(authenticatedPage.locator('#address-0-line1')).toHaveValue('111 First St');
    await expect(authenticatedPage.locator('#address-1-line1')).toHaveValue('222 Second St');

    const removeButton = authenticatedPage.getByRole('button', { name: /remove address 2/i });
    await removeButton.click();

    await peoplePage.submitPersonForm();
    await authenticatedPage.waitForLoadState('networkidle');

    const allAddresses = await aepList<AddressRecord>(userToken, 'addresses');
    void allAddresses.find((a) => a.id === secondAddress.id);

    const updatedSharedData = await getPersonSharedData(userToken, person.id);
    if (!updatedSharedData) throw new Error('Expected shared data to exist');

    const linkedAddresses = allAddresses.filter(
      (a) => a.shared_data_id === updatedSharedData.id,
    );
    expect(linkedAddresses.length).toBe(0);
  });
});
