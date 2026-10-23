/**
 * Person detail page — categorized documents, on the VM tier.
 *
 * A port of ../e2e/person-detail-documents.spec.ts. Seeds people and
 * documents through the client and checks that a person's detail page lists
 * the documents linked to them, grouped by category, and excludes documents
 * linked to someone else.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { createPerson } from '../e2e/helpers';
import { createDocumentWithPeople } from '../../documents/e2e/helpers';
import { PersonDetailPage } from '../e2e/PersonDetailPage';

describe('Person detail — documents', () => {
  let h: Harness;
  let detail: PersonDetailPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    detail = new PersonDetailPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('lists a person’s documents grouped by category', async () => {
    const alice = await createPerson(userToken, { name: 'Alice Rivera' });
    const bob = await createPerson(userToken, { name: 'Bob Stone' });

    await createDocumentWithPeople(userToken, {
      title: 'Alice W-2',
      docType: 'form-w2', // category: tax
      people: [alice.id],
    });
    await createDocumentWithPeople(userToken, {
      title: 'Alice Pharmacy Receipt',
      docType: 'medical-receipt', // category: medical
      people: [alice.id],
    });
    // Linked to Bob only — must not appear on Alice's page.
    await createDocumentWithPeople(userToken, {
      title: 'Bob W-2',
      docType: 'form-w2',
      people: [bob.id],
    });

    await h.driver.goto('/people');
    await detail.openFromList('Alice Rivera');

    await detail.expectName('Alice Rivera');
    await detail.expectDocumentInCategory('tax', 'Alice W-2');
    await detail.expectDocumentInCategory('medical', 'Alice Pharmacy Receipt');

    // Bob's document is absent from Alice's page.
    const bobDoc = h.driver.getByTestId('document-card').filter({ hasText: 'Bob W-2' });
    await h.driver.expect(bobDoc).toHaveCount(0);
  });

  test('shows an empty state when a person has no documents', async () => {
    const carol = await createPerson(userToken, { name: 'Carol Diaz' });
    await detail.goto(carol.id);
    await detail.expectName('Carol Diaz');
    await detail.expectNoDocuments();
  });
});
