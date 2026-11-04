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

interface GiftCardRow {
  id: string;
  merchant: string;
  amount: number;
}

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

describe('Gift Cards — routes', () => {
  let h: Harness;
  let giftCardsPage: GiftCardsPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    giftCardsPage = new GiftCardsPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('a merchant opens at its own address and survives a reload', async () => {
    await createGiftCard(userToken, { merchant: 'Target', amount: 100 });

    await h.driver.goto('/gift-cards/merchants/Target');
    await giftCardsPage.expectMerchantDetail('Target');
    await giftCardsPage.expectMerchantTotal(100);

    await h.driver.reload();
    await giftCardsPage.expectMerchantDetail('Target');
    await giftCardsPage.expectMerchantTotal(100);
    await h.driver.expectURL(/\/gift-cards\/merchants\/Target$/);
  });

  test('a merchant name with spaces and symbols round-trips through the address', async () => {
    await createGiftCard(userToken, { merchant: 'Bed Bath & Beyond', amount: 40 });
    await giftCardsPage.goto();

    await giftCardsPage.clickMerchant('Bed Bath & Beyond');
    await h.driver.expectURL(/\/gift-cards\/merchants\/Bed%20Bath%20%26%20Beyond$/);

    await h.driver.reload();
    await giftCardsPage.expectMerchantDetail('Bed Bath & Beyond');
    await giftCardsPage.expectMerchantTotal(40);

    await giftCardsPage.backToMerchants();
  });

  test('an unknown merchant says so', async () => {
    await createGiftCard(userToken, { merchant: 'Target', amount: 100 });

    await giftCardsPage.gotoMerchant('Nowhere');
    await h.driver.expect(h.driver.getByTestId('merchant-detail-error')).toBeVisible();
    await h.driver.expect(h.driver.getByRole('alert')).toContainText('No gift cards');
  });

  test('the add form has its own address and the edit form opens the card by id', async () => {
    const card = await createGiftCard(userToken, { merchant: 'Starbucks', amount: 25 });
    await giftCardsPage.goto();

    await giftCardsPage.clickAddGiftCard();
    await h.driver.expectURL(/\/gift-cards\/new$/);
    await h.driver.getByTestId('gift-card-form-cancel').click();
    await h.driver.expectURL(/\/gift-cards$/);

    await h.driver.goto(`/gift-cards/cards/${card.id}/edit`);
    await h.driver.expect(h.driver.locator('#merchant')).toHaveValue('Starbucks');
    await h.driver.locator('#amount').fill('30');
    await giftCardsPage.submitGiftCardForm();

    // Saving an edit returns to the card's merchant.
    await h.driver.expectURL(/\/gift-cards\/merchants\/Starbucks$/);
    await giftCardsPage.expectMerchantTotal(30);
    await expect
      .poll(async () =>
        (await e2eClient(userToken).collection<GiftCardRow>('gift-cards').get(card.id)).amount,
      )
      .toBe(30);
  });

  test('spending the last of a card celebrates once and returns to the list', async () => {
    const card = await createGiftCard(userToken, { merchant: 'Starbucks', amount: 25 });
    await giftCardsPage.gotoMerchant('Starbucks');
    await giftCardsPage.expectMerchantDetail('Starbucks');

    // Part of it: no fanfare.
    await giftCardsPage.useAmount(card.id, 10);
    await giftCardsPage.expectMerchantTotal(15);
    await h.driver.waitForNetworkIdle();
    await h.driver.expect(giftCardsPage.celebration).toHaveCount(0);

    // The rest: the card is used up and gone, so its merchant page gives way
    // to the list.
    await giftCardsPage.useAmount(card.id, 15);
    await h.driver.expect(giftCardsPage.celebration).toBeVisible();
    await h.driver.expect(giftCardsPage.celebration).toContainText('Used up!');
    await h.driver.expect(giftCardsPage.celebration).toContainText('Starbucks card fully spent');
    await h.driver.expect(giftCardsPage.celebration).toHaveCount(1);
    await h.driver.expectURL(/\/gift-cards$/);
    await giftCardsPage.expectGiftCardNotInList('Starbucks');
    expect(await e2eClient(userToken).collection<GiftCardRow>('gift-cards').listAll()).toEqual([]);
  });
});
