/**
 * People relationships (partner, parent, sibling), on the VM tier.
 *
 * Each test boots from a fresh copy of the template database, so there is no
 * cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { PeoplePage } from '../e2e/PeoplePage';
import { PersonDetailPage } from '../e2e/PersonDetailPage';
import {
  createPerson,
  createRelationship,
  getHouseholdsForPerson,
  listRelationships,
} from '../e2e/helpers';

describe('People relationships', () => {
  let h: Harness;
  let peoplePage: PeoplePage;
  let detailPage: PersonDetailPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    peoplePage = new PeoplePage(h.driver);
    detailPage = new PersonDetailPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('adding a parent in the form stores a parent row and shows on both people', async () => {
    const mom = await createPerson(userToken, { name: 'Mary Parent' });
    const kid = await createPerson(userToken, { name: 'Kid Parent' });

    await peoplePage.goto();
    await peoplePage.openEditForm('Kid Parent');
    await peoplePage.addRelative('parents', mom);
    await peoplePage.submitPersonForm();

    await expect
      .poll(async () =>
        (await listRelationships(userToken)).map((r) => [r.kind, r.person_a, r.person_b]),
      )
      .toEqual([['parent', mom.id, kid.id]]);

    await detailPage.goto(kid.id);
    await detailPage.expectFamily('parents', ['Mary Parent']);
    await detailPage.goto(mom.id);
    await detailPage.expectFamily('children', ['Kid Parent']);
  });

  test('choosing a partner stores a partner row and leaves households alone', async () => {
    const ann = await createPerson(userToken, { name: 'Ann Partner', address: '1 Ann St' });
    const bob = await createPerson(userToken, { name: 'Bob Partner', address: '2 Bob St' });

    await peoplePage.goto();
    await peoplePage.openEditForm('Ann Partner');
    await peoplePage.selectPartner('Bob Partner');
    await peoplePage.submitPersonForm();

    await expect.poll(async () => (await listRelationships(userToken)).length).toBe(1);
    const [row] = await listRelationships(userToken);
    expect(row.kind).toBe('partner');
    expect([row.person_a, row.person_b].sort()).toEqual([ann.id, bob.id].sort());

    // Partners living apart keep their own households.
    expect((await getHouseholdsForPerson(userToken, ann.id)).map((x) => x.line1)).toEqual(['1 Ann St']);
    expect((await getHouseholdsForPerson(userToken, bob.id)).map((x) => x.line1)).toEqual(['2 Bob St']);

    await peoplePage.expectPartnerOnCard(ann, 'Bob Partner');
    await peoplePage.expectPartnerOnCard(bob, 'Ann Partner');
  });

  test('a partner with no shared address still shows as a partner', async () => {
    const ann = await createPerson(userToken, { name: 'Ann Apart' });
    const bob = await createPerson(userToken, { name: 'Bob Apart' });
    await createRelationship(userToken, { kind: 'partner', person_a: ann.id, person_b: bob.id });

    await peoplePage.goto();
    await peoplePage.expectPartnerOnCard(ann, 'Bob Apart');
    await peoplePage.expectPartnerOnCard(bob, 'Ann Apart');
  });

  test('detail page shows stored and inferred siblings', async () => {
    const mom = await createPerson(userToken, { name: 'Mom Sib' });
    const ann = await createPerson(userToken, { name: 'Ann Sib' });
    const bob = await createPerson(userToken, { name: 'Bob Sib' });
    const cat = await createPerson(userToken, { name: 'Cat Sib' });
    await createRelationship(userToken, { kind: 'parent', person_a: mom.id, person_b: ann.id });
    await createRelationship(userToken, { kind: 'parent', person_a: mom.id, person_b: bob.id });
    await createRelationship(userToken, { kind: 'sibling', person_a: ann.id, person_b: cat.id });

    await detailPage.goto(ann.id);
    await detailPage.expectFamily('parents', ['Mom Sib']);
    // Cat is a stored sibling; Bob is inferred from the shared parent.
    await detailPage.expectFamily('siblings', ['Cat Sib', 'Bob Sib']);
  });

  test('deleting a person removes their relationships', async () => {
    const mom = await createPerson(userToken, { name: 'Mom Delete' });
    const kid = await createPerson(userToken, { name: 'Kid Delete' });
    await createRelationship(userToken, { kind: 'parent', person_a: mom.id, person_b: kid.id });

    await peoplePage.goto();
    await peoplePage.deletePerson('Mom Delete');

    await expect.poll(async () => (await listRelationships(userToken)).length).toBe(0);
    await detailPage.goto(kid.id);
    await detailPage.expectNoFamily();
  });
});
