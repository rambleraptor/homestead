/**
 * People households, on the VM tier: the Households page, the person form's
 * household picker and "New household" shortcut, and how households show on
 * person cards. Each test boots from a fresh copy of the template database, so
 * there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { HouseholdsPage } from '../e2e/HouseholdsPage';
import { PeoplePage } from '../e2e/PeoplePage';
import {
  createHousehold,
  createPerson,
  getHouseholdsForPerson,
  listHouseholds,
} from '../e2e/helpers';

describe('People households', () => {
  let h: Harness;
  let peoplePage: PeoplePage;
  let householdsPage: HouseholdsPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    peoplePage = new PeoplePage(h.driver);
    householdsPage = new HouseholdsPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('the New household shortcut creates a household with the person in it', async () => {
    await peoplePage.goto();
    await peoplePage.clickAddPerson();
    await h.driver.locator('#name').fill('Jane Smith');
    await peoplePage.startNewHousehold();
    await h.driver.expect(h.driver.locator('#new-household-name')).toHaveValue('Jane Smith');
    await h.driver.locator('#new-household-name').fill('Smith home');
    await h.driver.locator('#new-household-line1').fill('789 Pine Blvd');
    await h.driver.locator('#new-household-wifi-network').fill('PineNet');
    await h.driver.locator('#new-household-wifi-password').fill('hunter2');
    await peoplePage.submitPersonForm();

    await expect.poll(async () => (await listHouseholds(userToken)).length).toBe(1);
    const [household] = await listHouseholds(userToken);
    const people = await e2eClient(userToken).collection<{ id: string; name: string }>('people').listAll();
    const jane = people.find((p) => p.name === 'Jane Smith')!;
    expect(household).toMatchObject({
      name: 'Smith home',
      line1: '789 Pine Blvd',
      wifi_network: 'PineNet',
      wifi_password: 'hunter2',
    });
    expect(household.members).toEqual([jane.id]);

    await peoplePage.expectHouseholdOnCard(jane, '789 Pine Blvd');
    await peoplePage.expectHouseholdOnCard(jane, 'PineNet');
  });

  test('a New household without a name is blocked with a message', async () => {
    await peoplePage.goto();
    await peoplePage.clickAddPerson();
    await h.driver.locator('#name').fill('No Name Home');
    await peoplePage.startNewHousehold();
    await h.driver.locator('#new-household-name').fill('');
    await h.driver.getByTestId('person-form-submit').click();

    await h.driver.expect(h.driver.getByText('Household name is required')).toBeVisible();
    expect(await listHouseholds(userToken)).toEqual([]);
  });

  test('joining an existing household from the person form shares its address', async () => {
    const ann = await createPerson(userToken, { name: 'Ann Join' });
    const bob = await createPerson(userToken, { name: 'Bob Join' });
    const home = await createHousehold(userToken, {
      name: 'Join home',
      members: [ann.id],
      line1: '1 Shared St',
    });

    await peoplePage.goto();
    await peoplePage.openEditForm('Bob Join');
    await peoplePage.addHousehold(home);
    await peoplePage.submitPersonForm();

    await expect
      .poll(async () => (await getHouseholdsForPerson(userToken, bob.id)).map((x) => x.id))
      .toEqual([home.id]);
    await peoplePage.expectHouseholdOnCard(ann, '1 Shared St');
    await peoplePage.expectHouseholdOnCard(bob, '1 Shared St');
  });

  test('removing a household from the person form leaves the others in it', async () => {
    const ann = await createPerson(userToken, { name: 'Ann Leave' });
    const bob = await createPerson(userToken, { name: 'Bob Leave' });
    const home = await createHousehold(userToken, {
      name: 'Leave home',
      members: [ann.id, bob.id],
      line1: '2 Shared St',
    });

    await peoplePage.goto();
    await peoplePage.openEditForm('Bob Leave');
    await peoplePage.removeHousehold(home);
    await peoplePage.submitPersonForm();

    await expect
      .poll(async () => (await listHouseholds(userToken))[0].members)
      .toEqual([ann.id]);
    await peoplePage.expectNoHouseholdOnCard(bob);
    await peoplePage.expectHouseholdOnCard(ann, '2 Shared St');
  });

  test('a person in two households shows both', async () => {
    const cat = await createPerson(userToken, { name: 'Cat Two' });
    await createHousehold(userToken, { name: 'Main home', members: [cat.id], line1: '3 Main St' });
    await createHousehold(userToken, { name: 'Lake house', members: [cat.id], line1: '9 Lake Rd' });

    await peoplePage.goto();
    await peoplePage.expectHouseholdOnCard(cat, 'Main home');
    await peoplePage.expectHouseholdOnCard(cat, '3 Main St');
    await peoplePage.expectHouseholdOnCard(cat, 'Lake house');
    await peoplePage.expectHouseholdOnCard(cat, '9 Lake Rd');
  });

  test('the Households page creates, edits and deletes a household', async () => {
    const ann = await createPerson(userToken, { name: 'Ann Page' });
    const bob = await createPerson(userToken, { name: 'Bob Page' });

    await peoplePage.goto();
    await householdsPage.openFromPeople();
    await householdsPage.expectEmpty();

    await householdsPage.createHousehold({
      name: 'Page home',
      address: '4 Page Ln',
      wifiNetwork: 'PageNet',
      addMembers: [ann, bob],
    });
    await expect.poll(async () => (await listHouseholds(userToken)).length).toBe(1);
    const [home] = await listHouseholds(userToken);
    expect(home).toMatchObject({ name: 'Page home', line1: '4 Page Ln', wifi_network: 'PageNet' });
    expect([...(home.members ?? [])].sort()).toEqual([ann.id, bob.id].sort());
    await householdsPage.expectHouseholdShows(home, 'Ann Page');
    await householdsPage.expectHouseholdShows(home, 'Bob Page');

    await householdsPage.editHousehold('Page home', {
      address: '5 Moved Ave',
      removeMembers: [bob],
    });
    await expect
      .poll(async () => (await listHouseholds(userToken))[0])
      .toMatchObject({ line1: '5 Moved Ave', members: [ann.id] });
    await householdsPage.expectHouseholdShows(home, '5 Moved Ave');

    await householdsPage.deleteHousehold('Page home');
    await expect.poll(async () => (await listHouseholds(userToken)).length).toBe(0);
    await householdsPage.expectEmpty();
    // Members stay; only the household goes.
    const people = await e2eClient(userToken).collection<{ id: string }>('people').listAll();
    expect(people.map((p) => p.id).sort()).toEqual([ann.id, bob.id].sort());
  });

  test('deleting a person drops them from their households', async () => {
    const ann = await createPerson(userToken, { name: 'Ann Stays' });
    const bob = await createPerson(userToken, { name: 'Bob Goes' });
    await createHousehold(userToken, {
      name: 'Shrinking home',
      members: [ann.id, bob.id],
      line1: '6 Small St',
    });

    await peoplePage.goto();
    await peoplePage.deletePerson('Bob Goes');

    await expect
      .poll(async () => (await listHouseholds(userToken))[0].members)
      .toEqual([ann.id]);
  });
});
