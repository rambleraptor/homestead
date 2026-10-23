/**
 * Gift Cards — Merchant Summaries, on the VM tier.
 *
 * A port of ../e2e/merchant-summary.spec.ts: same page object and seed
 * helpers, but the SPA runs in happy-dom against the server's in-process fetch
 * handler. Each test boots from a fresh copy of the template database, so
 * there is no cleanup to do.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { GiftCardsPage } from '../e2e/GiftCardsPage';
import { createMultipleGiftCards } from '../e2e/helpers';

describe('Merchant Summaries', () => {
  let h: Harness;
  let giftCardsPage: GiftCardsPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    giftCardsPage = new GiftCardsPage(h.driver);
    await giftCardsPage.goto();
  });

  afterEach(async () => {
    await h.close();
  });

  test('should calculate merchant summary correctly for multiple cards', async () => {
    // Create multiple cards for same merchant
    const amazonCards = [
      { merchant: 'Amazon', amount: 50 },
      { merchant: 'Amazon', amount: 30 },
      { merchant: 'Amazon', amount: 20 },
    ];

    await createMultipleGiftCards(userToken, amazonCards);

    await giftCardsPage.goto();

    // Verify merchant appears
    await giftCardsPage.expectGiftCardInList('Amazon');
  });

  test('should show separate summaries for different merchants', async () => {
    const cards = [
      { merchant: 'Amazon', amount: 50 },
      { merchant: 'Amazon', amount: 30 },
      { merchant: 'Starbucks', amount: 25 },
      { merchant: 'Target', amount: 100 },
    ];

    await createMultipleGiftCards(userToken, cards);

    await giftCardsPage.goto();

    // All merchants should appear
    await giftCardsPage.expectGiftCardInList('Amazon');
    await giftCardsPage.expectGiftCardInList('Starbucks');
    await giftCardsPage.expectGiftCardInList('Target');
  });
});
