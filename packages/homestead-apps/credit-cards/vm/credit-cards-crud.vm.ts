/**
 * Credit Cards — the nested perk/redemption flow, on the VM tier.
 *
 * A port of tests/e2e/tests/credit-cards/credit-cards-crud.spec.ts: same page
 * object, same steps, but the SPA runs in happy-dom against the server's
 * in-process fetch handler. Each test boots from a fresh copy of the template
 * database, so there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { collectionAt, serverClient } from '@rambleraptor/homestead-core/server/client';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { CreditCardsPage } from '../../../../tests/e2e/pages/CreditCardsPage';

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
    await cc.addCard({
      name: 'E2E Amex Gold',
      issuer: 'American Express',
      annualFee: 250,
      anniversary: '2020-01-15',
    });
    await cc.openCard('E2E Amex Gold');

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
    await cc.openCard('E2E Chase Sapphire');
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
});
