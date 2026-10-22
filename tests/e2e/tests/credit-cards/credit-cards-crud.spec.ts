/**
 * Credit Cards E2E — the nested perk/redemption flow.
 *
 * Perks are aepbase children of a credit-card, and redemptions are children
 * of a perk (two levels deep). This spec drives create/update/delete/redeem
 * through the UI against a real aepbase, so it exercises the generic offline
 * mutation factory's convention-based nesting end to end — the path that
 * replaced the hand-written perk/redemption hooks and let us drop the
 * `offlineOverrides: { perk: false, redemption: false }` opt-out.
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { CreditCardsPage } from '../../pages/CreditCardsPage';
import { playwrightDriver } from '../../../../packages/homestead-test-harness/driver/pw-driver';
import { deleteIfPresent, listOrEmpty } from '../../utils/aepbase-helpers';

interface CardRec {
  id: string;
  name: string;
}

async function clearCards(token: string): Promise<void> {
  const cards = await listOrEmpty<CardRec>(token, 'credit-cards');
  for (const card of cards) {
    // Cards own perk (and grandchild redemption) rows — force-cascade.
    await deleteIfPresent(token, 'credit-cards', card.id, { force: true });
  }
}

test.describe('Credit Cards — nested perk/redemption flow', () => {
  let cc: CreditCardsPage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    await clearCards(userToken);
    cc = new CreditCardsPage(playwrightDriver(authenticatedPage));
    await cc.goto();
  });

  test.afterEach(async ({ userToken }) => {
    await clearCards(userToken);
  });

  test('creates, redeems, edits, and deletes a nested perk', async () => {
    await cc.addCard({
      name: 'E2E Amex Gold',
      issuer: 'American Express',
      annualFee: 250,
      anniversary: '2020-01-15',
    });
    await cc.openCard('E2E Amex Gold');

    // Create — useCreatePerk via the factory (POST /credit-cards/{id}/perks,
    // credit_card FK stripped from the body, kept on the optimistic record).
    await cc.addPerk({ name: 'Dining Credit', value: 20, frequency: 'monthly' });
    expect(await cc.perkRedemptionStatus('Dining Credit')).toBe('none');

    // Redeem — useRedeemPerk creates a redemption two levels deep
    // (POST /credit-cards/{id}/perks/{id}/redemptions, card id walked from
    // the cached perk record). Full value → status flips to 'full'.
    await cc.redeemPerk('Dining Credit');
    await expect
      .poll(() => cc.perkRedemptionStatus('Dining Credit'))
      .toBe('full');

    // Update — useUpdatePerk (PATCH nested; parent resolved from cache).
    await cc.editPerkValue('Dining Credit', 30);
    await cc.driver.expect(cc.perkRow('Dining Credit')).toContainText('$30');

    // Delete — useDeletePerk (parent chain resolved before optimistic removal
    // and baked into the persisted variables).
    await cc.deletePerk('Dining Credit');
    await cc.driver.expect(cc.perkRow('Dining Credit')).toHaveCount(0);
  });

  test('persists a nested perk to the server under the correct parent', async ({
    userToken,
  }) => {
    await cc.addCard({
      name: 'E2E Chase Sapphire',
      issuer: 'Chase',
      annualFee: 95,
      anniversary: '2020-06-01',
    });
    await cc.openCard('E2E Chase Sapphire');
    await cc.addPerk({ name: 'Travel Credit', value: 300, frequency: 'annual' });

    // The perk must land under the card's nested collection, not a flat one.
    await expect
      .poll(async () => {
        const cards = await listOrEmpty<CardRec>(userToken, 'credit-cards');
        const card = cards.find((c) => c.name === 'E2E Chase Sapphire');
        if (!card) return 0;
        const perks = await listOrEmpty<{ name: string }>(userToken, 'perks', {
          parent: ['credit-cards', card.id],
        });
        return perks.filter((p) => p.name === 'Travel Credit').length;
      })
      .toBe(1);
  });
});
