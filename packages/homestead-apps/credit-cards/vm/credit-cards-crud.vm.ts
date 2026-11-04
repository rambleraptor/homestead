/**
 * Credit Cards — the nested perk/redemption flow, on the VM tier.
 *
 * The SPA runs in happy-dom against the server's in-process fetch handler.
 * Each test boots from a fresh copy of the template database, so there is no
 * cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { collectionAt, serverClient } from '@rambleraptor/homestead-core/server/client';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { CreditCardsPage } from '../e2e/CreditCardsPage';
import { createCreditCard, createPerk } from '../e2e/helpers';

interface CardRec {
  id: string;
  name: string;
}

describe('Credit Cards — nested perk/redemption flow', () => {
  let h: Harness;
  let cc: CreditCardsPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    cc = new CreditCardsPage(h.driver);
    await cc.goto();
  });

  afterEach(async () => {
    await h.close();
  });

  test('creates, redeems, edits, and deletes a nested perk', async () => {
    // Saving a new card opens its own page, where perks are managed.
    await cc.addCard({
      name: 'E2E Amex Gold',
      issuer: 'American Express',
      annualFee: 250,
      anniversary: '2020-01-15',
    });

    await cc.addPerk({ name: 'Dining Credit', value: 20, frequency: 'monthly' });
    expect(await cc.perkRedemptionStatus('Dining Credit')).toBe('none');

    await cc.redeemPerk('Dining Credit');
    await expect.poll(() => cc.perkRedemptionStatus('Dining Credit')).toBe('full');

    await cc.editPerkValue('Dining Credit', 30);
    await cc.driver.expect(cc.perkRow('Dining Credit')).toContainText('$30');

    await cc.deletePerk('Dining Credit');
    await cc.driver.expect(cc.perkRow('Dining Credit')).toHaveCount(0);
  });

  test('persists a nested perk to the server under the correct parent', async () => {
    await cc.addCard({
      name: 'E2E Chase Sapphire',
      issuer: 'Chase',
      annualFee: 95,
      anniversary: '2020-06-01',
    });
    await cc.addPerk({ name: 'Travel Credit', value: 300, frequency: 'annual' });

    const hs = serverClient(userToken);
    await expect
      .poll(async () => {
        const cards = await hs.collection<CardRec>('credit-cards').listAll();
        const card = cards.find((c) => c.name === 'E2E Chase Sapphire');
        if (!card) return 0;
        const perks = await collectionAt<{ name: string }>(hs, 'perks', [
          'credit-cards',
          card.id,
        ]).listAll();
        return perks.filter((p) => p.name === 'Travel Credit').length;
      })
      .toBe(1);
  });

  test('celebrates once when the redemption completes the card', async () => {
    const card = await createCreditCard(userToken, { name: 'Celebration Card' });
    await createPerk(userToken, card.id, { name: 'Streaming Credit', value: 10 });
    await createPerk(userToken, card.id, { name: 'Dining Credit', value: 20 });
    await cc.gotoCard(card.id);
    await cc.expectCardDetail('Celebration Card');

    // One of two perks: still something on the table.
    await cc.redeemPerk('Streaming Credit');
    await expect.poll(() => cc.perkRedemptionStatus('Streaming Credit')).toBe('full');
    await h.driver.waitForNetworkIdle();
    await cc.driver.expect(cc.celebration).toHaveCount(0);

    // The last one completes the card.
    await cc.redeemPerk('Dining Credit');
    await cc.driver.expect(cc.celebration).toBeVisible();
    await cc.driver.expect(cc.celebration).toContainText('All perks used');
    await cc.driver.expect(cc.celebration).toContainText('Celebration Card');
    await cc.driver.expect(cc.celebration).toHaveCount(1);
  });
});

describe('Credit Cards — routes', () => {
  let h: Harness;
  let cc: CreditCardsPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    cc = new CreditCardsPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('a card opens at its own address and survives a reload', async () => {
    const card = await createCreditCard(userToken, {
      name: 'Deep Link Card',
      issuer: 'Deep Bank',
    });

    await cc.gotoCard(card.id);
    await cc.expectCardDetail('Deep Link Card');
    await h.driver.expectURL(new RegExp(`/credit-cards/${card.id}$`));

    await h.driver.reload();
    await cc.expectCardDetail('Deep Link Card');
    await h.driver.expectURL(new RegExp(`/credit-cards/${card.id}$`));
  });

  test('tiles link to the card, and the card links back to the list', async () => {
    const card = await createCreditCard(userToken, { name: 'Linked Card' });
    await cc.goto();

    await cc.driver.expect(cc.cardRow('Linked Card')).toHaveAttribute(
      'href',
      `/credit-cards/${card.id}`,
    );
    await cc.openCard('Linked Card');
    await h.driver.expectURL(new RegExp(`/credit-cards/${card.id}$`));

    await cc.backToList();
    await h.driver.expectURL(/\/credit-cards$/);
  });

  test('editing from the card page returns to it', async () => {
    const card = await createCreditCard(userToken, { name: 'Old Name' });
    await cc.gotoCard(card.id);
    await cc.expectCardDetail('Old Name');

    await cc.editCardFromDetail();
    await h.driver.expectURL(new RegExp(`/credit-cards/${card.id}/edit$`));
    await h.driver.locator('#card-name').fill('New Name');
    await h.driver.getByTestId('credit-card-form-submit').click();

    await cc.expectCardDetail('New Name');
    await h.driver.expectURL(new RegExp(`/credit-cards/${card.id}$`));
    await expect
      .poll(async () =>
        (await e2eClient(userToken).collection<CardRec>('credit-cards').get(card.id)).name,
      )
      .toBe('New Name');
  });

  test('deleting from the card page returns to the list', async () => {
    const card = await createCreditCard(userToken, { name: 'Doomed Card' });
    await cc.gotoCard(card.id);
    await cc.expectCardDetail('Doomed Card');

    await cc.deleteCardFromDetail();
    await h.driver.expectURL(/\/credit-cards$/);
    await cc.expectList();
    await cc.driver.expect(cc.cardRow('Doomed Card')).toHaveCount(0);
  });

  test('an unknown card says so instead of loading forever', async () => {
    await cc.gotoCard('no-such-card');
    await h.driver.expect(h.driver.getByTestId('credit-card-detail-error')).toBeVisible();
    await h.driver.expect(h.driver.getByRole('alert')).toBeVisible();
  });
});
