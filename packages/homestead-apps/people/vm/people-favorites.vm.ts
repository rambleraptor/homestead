/**
 * People favorites (starring), on the VM tier.
 *
 * A port of ../e2e/people-favorites.spec.ts. Stars are stored as per-user
 * `favorite` records (create on star, delete on unstar). This proves the
 * round-trip through the UI: the star button reflects and persists state
 * across a reload, exercising the `favorite` resource end-to-end (create +
 * list + delete).
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { PeoplePage } from '../e2e/PeoplePage';
import { createPerson } from '../e2e/helpers';

describe('People favorites', () => {
  let h: Harness;
  let peoplePage: PeoplePage;
  let userToken: string;
  let userId: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken, id: userId } = await h.loginAs(h.member));
    peoplePage = new PeoplePage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('stars a person and the star persists across a reload', async () => {
    const person = await createPerson(userToken, {
      name: 'Star Target',
      createdByUserId: userId,
    });
    await peoplePage.goto();

    const star = h.driver.getByTestId(`person-star-${person.id}`);
    await h.driver.expect(star).toHaveAttribute('aria-pressed', 'false');

    await star.click();
    await h.driver.expect(star).toHaveAttribute('aria-pressed', 'true');

    // Reload: the star state comes back from the persisted favorite record.
    await h.driver.reload();
    const starAfter = h.driver.getByTestId(`person-star-${person.id}`);
    await h.driver.expect(starAfter).toHaveAttribute('aria-pressed', 'true');

    // Unstar removes the favorite record.
    await starAfter.click();
    await h.driver.expect(starAfter).toHaveAttribute('aria-pressed', 'false');

    await h.driver.reload();
    await h.driver
      .expect(h.driver.getByTestId(`person-star-${person.id}`))
      .toHaveAttribute('aria-pressed', 'false');
  });
});
