/**
 * Gift Cards CRUD, on the VM tier.
 *
 * A port of ../e2e/gift-card-crud.spec.ts: same page object and seed helpers,
 * but the SPA runs in happy-dom against the server's in-process fetch handler.
 * Each test boots from a fresh copy of the template database, so there is no
 * cleanup to do.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';
import { GiftCardsPage } from '../e2e/GiftCardsPage';
import { createGiftCard, createMultipleGiftCards, testGiftCards } from '../e2e/helpers';

describe('Gift Cards CRUD', () => {
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

  test('should create a new gift card', async () => {
    const cardData = testGiftCards[0];
    await giftCardsPage.createGiftCard(cardData);
    await giftCardsPage.expectGiftCardInList(cardData.merchant, cardData.amount);
  });

  test('should create multiple gift cards', async () => {
    for (const cardData of testGiftCards.slice(0, 3)) {
      await giftCardsPage.createGiftCard(cardData);
    }
    for (const cardData of testGiftCards.slice(0, 3)) {
      await giftCardsPage.expectGiftCardInList(cardData.merchant);
    }
  });

  test('should edit existing gift card', async () => {
    const originalCard = testGiftCards[0];
    const createdCard = await createGiftCard(userToken, originalCard);
    await giftCardsPage.goto();
    await giftCardsPage.expectGiftCardInList(originalCard.merchant, originalCard.amount);

    const newAmount = 75.0;
    await giftCardsPage.editGiftCard(originalCard.merchant, { amount: newAmount }, originalCard.amount);

    const updatedCard = await e2eClient(userToken)
      .collection<{ amount: number }>('gift-cards')
      .get(createdCard.id);
    expect(updatedCard.amount).toBe(newAmount);
    await giftCardsPage.expectGiftCardInList(originalCard.merchant, newAmount);
  });

  test('should delete a gift card', async () => {
    await createGiftCard(userToken, testGiftCards[0]);
    await giftCardsPage.goto();
    await giftCardsPage.expectGiftCardInList(testGiftCards[0].merchant, testGiftCards[0].amount);

    await giftCardsPage.deleteGiftCard(testGiftCards[0].merchant, testGiftCards[0].amount);
    await giftCardsPage.expectGiftCardNotInList(testGiftCards[0].merchant);
  });

  test('should display multiple cards from same merchant', async () => {
    const amazonCards = testGiftCards.filter((card) => card.merchant === 'Amazon');
    await createMultipleGiftCards(userToken, amazonCards);
    await giftCardsPage.goto();
    await giftCardsPage.expectGiftCardInList('Amazon');
  });
});
