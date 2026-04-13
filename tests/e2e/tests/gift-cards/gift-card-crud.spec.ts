/**
 * Gift Cards E2E Tests - CRUD Operations
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { GiftCardsPage } from '../../pages/GiftCardsPage';
import { testGiftCards } from '../../fixtures/test-data';
import {
  createGiftCard,
  createMultipleGiftCards,
  deleteAllGiftCards,
  aepGet,
} from '../../utils/aepbase-helpers';

test.describe('Gift Cards CRUD', () => {
  let giftCardsPage: GiftCardsPage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    giftCardsPage = new GiftCardsPage(authenticatedPage);

    // Clean up any existing gift cards for this test user
    await deleteAllGiftCards(userToken);

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

  test('should edit existing gift card', async ({ page, userToken }) => {
    // Create a gift card via API for faster setup
    const originalCard = testGiftCards[0];
    const createdCard = await createGiftCard(userToken, originalCard);

    // Navigate to gift cards page
    await giftCardsPage.goto();

    // Verify card appears with original amount
    await giftCardsPage.expectGiftCardInList(originalCard.merchant, originalCard.amount);

    // Edit the card
    const newAmount = 75.00;
    await giftCardsPage.editGiftCard(
      originalCard.merchant,
      { amount: newAmount },
      originalCard.amount
    );

    // Verify the card was updated in the database
    const updatedCard = await aepGet<{ amount: number }>(userToken, 'gift-cards', createdCard.id);
    expect(updatedCard.amount).toBe(newAmount);

    // Verify the updated amount appears in the UI
    await giftCardsPage.expectGiftCardInList(originalCard.merchant, newAmount);
  });

  test('should delete a gift card', async ({ userToken }) => {
    // Create a gift card via API
    await createGiftCard(userToken, testGiftCards[0]);

    await giftCardsPage.goto();

    // Verify card exists
    await giftCardsPage.expectGiftCardInList(testGiftCards[0].merchant, testGiftCards[0].amount);

    // Delete it
    await giftCardsPage.deleteGiftCard(testGiftCards[0].merchant, testGiftCards[0].amount);

    // Verify it's removed
    await giftCardsPage.expectGiftCardNotInList(testGiftCards[0].merchant);
  });

  test('should display multiple cards from same merchant', async ({ userToken }) => {
    // Create multiple cards for Amazon
    const amazonCards = testGiftCards.filter(card => card.merchant === 'Amazon');
    await createMultipleGiftCards(userToken, amazonCards);

    await giftCardsPage.goto();

    // Merchant should appear (might be in summary view)
    await giftCardsPage.expectGiftCardInList('Amazon');
  });
});
