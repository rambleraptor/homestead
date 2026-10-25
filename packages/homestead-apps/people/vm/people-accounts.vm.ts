/**
 * Linking people to their Homestead accounts (`person.user`), on the VM tier:
 * the account picker in the person form, and the "Which one is you?" banner.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { PeoplePage } from '../e2e/PeoplePage';
import { PersonDetailPage } from '../e2e/PersonDetailPage';
import { createPerson, getPerson } from '../e2e/helpers';

/** The account a stored link names, however it was written. */
const accountOf = async (token: string, personId: string) =>
  ((await getPerson(token, personId)).user ?? '').replace(/^users\//, '') || null;

describe('People accounts', () => {
  let h: Harness;
  let people: PeoplePage;
  let token: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token } = await h.loginAs(h.member));
    people = new PeoplePage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('the form links an account, moving it off whoever had it', async () => {
    const sam = h.householdMember;
    const old = await createPerson(token, { name: 'Sam Old', userId: sam.id });
    const fresh = await createPerson(token, { name: 'Sam New' });
    await createPerson(token, { name: 'VM Member', userId: h.member.id });

    await people.goto();
    await people.openEditForm('Sam New');
    await people.selectAccount('Sam (now linked to Sam Old)');
    await people.submitPersonForm();

    await expect.poll(() => accountOf(token, fresh.id)).toBe(sam.id);
    await expect.poll(() => accountOf(token, old.id)).toBeNull();

    const detail = new PersonDetailPage(h.driver);
    await detail.goto(fresh.id);
    await detail.expectHasAccount(true);
    await detail.goto(old.id);
    await detail.expectHasAccount(false);
  });

  test('the form can unlink an account', async () => {
    const sam = await createPerson(token, { name: 'Sam', userId: h.householdMember.id });
    await createPerson(token, { name: 'VM Member', userId: h.member.id });
    await people.goto();
    await people.openEditForm('Sam');
    await people.selectAccount('No account');
    await people.submitPersonForm();
    await expect.poll(() => accountOf(token, sam.id)).toBeNull();
  });

  test('"Which one is you?" suggests the person with your name', async () => {
    const me = await createPerson(token, { name: 'VM Member' });
    await createPerson(token, { name: 'Someone Else' });
    await people.goto();
    await h.driver.expect(people.whichOneIsYou).toContainText('Is this you? VM Member');

    await people.confirmSuggestedSelf();
    await expect.poll(() => accountOf(token, me.id)).toBe(h.member.id);
    await h.driver.expect(people.whichOneIsYou).toHaveCount(0);
  });

  test('"Not me" picks someone else from the list', async () => {
    await createPerson(token, { name: 'VM Member' });
    const actual = await createPerson(token, { name: 'Vee Em' });
    await people.goto();
    await people.pickSelf('Vee Em', { rejectSuggestion: true });
    await expect.poll(() => accountOf(token, actual.id)).toBe(h.member.id);
  });

  test('dismissing it keeps it away on this device', async () => {
    await createPerson(token, { name: 'Someone Else' });
    await people.goto();
    await h.driver.expect(people.whichOneIsYou).toContainText('Which one is you?');
    await people.dismissWhichOneIsYou();
    await h.driver.reload();
    await people.expectPersonInList('Someone Else');
    await h.driver.expect(people.whichOneIsYou).toHaveCount(0);
  });
});
