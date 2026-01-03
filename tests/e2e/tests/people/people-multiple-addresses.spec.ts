/**
 * People E2E Tests - Multiple Addresses
 * Tests the functionality of adding multiple addresses to a person
 */

import { test, expect } from '../../fixtures/pocketbase.fixture';
import { PeoplePage } from '../../pages/PeoplePage';
import { createPerson, deleteAllPeople, getPersonSharedData } from '../../utils/pocketbase-helpers';

test.describe('People Multiple Addresses', () => {
  let peoplePage: PeoplePage;

  test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
    peoplePage = new PeoplePage(authenticatedPage);

    // Clean up any existing people and addresses
    await deleteAllPeople(userPocketbase);

    await peoplePage.goto();
  });

  test('should add a second address to an existing person', async ({ authenticatedPage, userPocketbase }) => {
    // Create a person with one address via API
    const person = await createPerson(userPocketbase, {
      name: 'John Doe',
      address: '123 Main St',
    });

    await peoplePage.goto();

    // Edit the person to add a second address
    await peoplePage.expectPersonInList('John Doe');

    const editButton = authenticatedPage.getByRole('button', { name: 'Edit John Doe' }).first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();

    await authenticatedPage.locator('#name').waitFor({ state: 'visible' });

    // Click "Add Address" to add a second address
    const addAddressButton = authenticatedPage.getByRole('button', { name: /add address/i });
    await addAddressButton.waitFor({ state: 'visible' });
    await addAddressButton.click();

    // Fill in the second address (should be #address-1-line1)
    const secondAddressInput = authenticatedPage.locator('#address-1-line1');
    await secondAddressInput.waitFor({ state: 'visible' });
    await secondAddressInput.fill('456 Oak Ave');

    // Submit the form
    const submitButton = authenticatedPage.getByTestId('person-form-submit');
    await submitButton.click();
    await submitButton.waitFor({ state: 'hidden' });
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify in database that both addresses exist
    const sharedData = await getPersonSharedData(userPocketbase, person.id);
    expect(sharedData).not.toBeNull();

    if (!sharedData) {
      throw new Error('Expected shared data to exist');
    }

    // Get primary address
    const primaryAddress = await userPocketbase.collection('addresses').getOne(sharedData.address_id);
    expect(primaryAddress.line1).toBe('123 Main St');
    // PocketBase returns empty string for unset optional fields
    expect(primaryAddress.shared_data_id || undefined).toBeUndefined(); // Primary address should not have shared_data_id

    // Get additional addresses
    const additionalAddresses = await userPocketbase.collection('addresses').getFullList({
      filter: `shared_data_id = "${sharedData.id}"`,
    });

    expect(additionalAddresses.length).toBe(1);
    expect(additionalAddresses[0].line1).toBe('456 Oak Ave');
    expect(additionalAddresses[0].shared_data_id).toBe(sharedData.id);

    // Verify in UI by re-editing the person
    await peoplePage.expectPersonInList('John Doe');
    const editButton2 = authenticatedPage.getByRole('button', { name: 'Edit John Doe' }).first();
    await editButton2.click();
    await authenticatedPage.locator('#name').waitFor({ state: 'visible' });

    // Check that both address inputs are visible
    await expect(authenticatedPage.locator('#address-0-line1')).toHaveValue('123 Main St');
    await expect(authenticatedPage.locator('#address-1-line1')).toHaveValue('456 Oak Ave');
  });

  test('should create a person with multiple addresses from the start', async ({ authenticatedPage, userPocketbase }) => {
    await peoplePage.clickAddPerson();

    // Fill in name
    await authenticatedPage.locator('#name').fill('Jane Smith');

    // Add first address
    const addAddressButton = authenticatedPage.getByRole('button', { name: /add address/i });
    await addAddressButton.click();
    await authenticatedPage.locator('#address-0-line1').fill('789 Pine Blvd');

    // Add second address
    await addAddressButton.click();
    await authenticatedPage.locator('#address-1-line1').fill('321 Elm Dr');

    // Submit the form
    await peoplePage.submitPersonForm();
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify in database
    const people = await userPocketbase.collection('people').getFullList();
    const jane = people.find(p => p.name === 'Jane Smith');
    expect(jane).toBeDefined();

    if (!jane) {
      throw new Error('Expected to find Jane Smith');
    }

    const sharedData = await getPersonSharedData(userPocketbase, jane.id);
    expect(sharedData).not.toBeNull();

    if (!sharedData) {
      throw new Error('Expected shared data to exist');
    }

    // Get primary address
    const primaryAddress = await userPocketbase.collection('addresses').getOne(sharedData.address_id);
    expect(primaryAddress.line1).toBe('789 Pine Blvd');

    // Get additional addresses
    const additionalAddresses = await userPocketbase.collection('addresses').getFullList({
      filter: `shared_data_id = "${sharedData.id}"`,
    });

    expect(additionalAddresses.length).toBe(1);
    expect(additionalAddresses[0].line1).toBe('321 Elm Dr');
  });

  test('should remove a second address', async ({ authenticatedPage, userPocketbase }) => {
    // Create a person with one address
    const person = await createPerson(userPocketbase, {
      name: 'Bob Jones',
      address: '111 First St',
    });

    // Get shared data and manually add a second address
    const sharedData = await getPersonSharedData(userPocketbase, person.id);
    if (!sharedData) {
      throw new Error('Expected shared data to exist');
    }

    const secondAddress = await userPocketbase.collection('addresses').create({
      line1: '222 Second St',
      shared_data_id: sharedData.id,
      created_by: userPocketbase.authStore.model?.id,
    });

    await peoplePage.goto();

    // Edit the person
    const editButton = authenticatedPage.getByRole('button', { name: 'Edit Bob Jones' }).first();
    await editButton.click();
    await authenticatedPage.locator('#name').waitFor({ state: 'visible' });

    // Verify both addresses are showing
    await expect(authenticatedPage.locator('#address-0-line1')).toHaveValue('111 First St');
    await expect(authenticatedPage.locator('#address-1-line1')).toHaveValue('222 Second St');

    // Remove the second address
    const removeButton = authenticatedPage.getByRole('button', { name: /remove address 2/i });
    await removeButton.click();

    // Submit the form
    await peoplePage.submitPersonForm();
    await authenticatedPage.waitForLoadState('networkidle');

    // Verify in database that the second address still exists but isn't linked
    // (We're not deleting addresses, just unlinking them)
    // Actually, we should verify the behavior - do we delete or just unlink?
    const allAddresses = await userPocketbase.collection('addresses').getFullList();
    const secondAddressStillExists = allAddresses.find(a => a.id === secondAddress.id);

    // For now, let's just verify that it's not linked to the shared data anymore
    const updatedSharedData = await getPersonSharedData(userPocketbase, person.id);
    if (!updatedSharedData) {
      throw new Error('Expected shared data to exist');
    }

    const linkedAddresses = await userPocketbase.collection('addresses').getFullList({
      filter: `shared_data_id = "${updatedSharedData.id}"`,
    });

    // Should be no additional addresses
    expect(linkedAddresses.length).toBe(0);
  });
});
