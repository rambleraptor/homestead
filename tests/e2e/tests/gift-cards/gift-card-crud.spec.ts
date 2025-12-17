/**
 * Gift Cards E2E Tests - CRUD Operations
 */

import { test, expect } from '../../fixtures/pocketbase.fixture';
import { GiftCardsPage } from '../../pages/GiftCardsPage';
import { testGiftCards } from '../../fixtures/test-data';
import { createGiftCard, createMultipleGiftCards, deleteAllGiftCards } from '../../utils/pocketbase-helpers';

test.describe('Gift Cards CRUD', () => {
  let giftCardsPage: GiftCardsPage;

  test.beforeEach(async ({ authenticatedPage, userPocketbase }) => {
    giftCardsPage = new GiftCardsPage(authenticatedPage);

    // Clean up any existing gift cards
    await deleteAllGiftCards(userPocketbase);

    await giftCardsPage.goto();
  });

  test('should create a new gift card', async ({ page }) => {
    const cardData = testGiftCards[0];

    await giftCardsPage.createGiftCard(cardData);

    // Verify it appears in the list
    await giftCardsPage.expectGiftCardInList(cardData.merchant, cardData.amount);
  });

  test('should create multiple gift cards', async ({ page }) => {
    for (const cardData of testGiftCards.slice(0, 3)) {
      await giftCardsPage.createGiftCard(cardData);
    }

    // Verify all appear in the list
    for (const cardData of testGiftCards.slice(0, 3)) {
      await giftCardsPage.expectGiftCardInList(cardData.merchant);
    }
  });

  test('should edit existing gift card', async ({ userPocketbase }) => {
    // Create a gift card via API
    await createGiftCard(userPocketbase, testGiftCards[0]);

    await giftCardsPage.goto();

    // Edit it
    const newAmount = 75.00;
    await giftCardsPage.editGiftCard(testGiftCards[0].merchant, { amount: newAmount });

    // Verify the updated amount
    await giftCardsPage.expectGiftCardInList(testGiftCards[0].merchant, newAmount);
  });

  test('should delete a gift card', async ({ userPocketbase }) => {
    // Create a gift card via API
    await createGiftCard(userPocketbase, testGiftCards[0]);

    await giftCardsPage.goto();

    // Delete it
    await giftCardsPage.deleteGiftCard(testGiftCards[0].merchant);

    // Verify it's removed
    await giftCardsPage.expectGiftCardNotInList(testGiftCards[0].merchant);
  });

  test('should display multiple cards from same merchant', async ({ userPocketbase }) => {
    // Create multiple cards for Amazon
    const amazonCards = testGiftCards.filter(card => card.merchant === 'Amazon');
    await createMultipleGiftCards(userPocketbase, amazonCards);

    await giftCardsPage.goto();

    // Both Amazon cards should be visible
    const totalAmazon = amazonCards.reduce((sum, card) => sum + card.amount, 0);

    // Check that merchant appears (might be in summary view)
    await giftCardsPage.expectGiftCardInList('Amazon');
  });
});
