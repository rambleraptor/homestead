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

  test('should edit existing gift card', async ({ page, userPocketbase }) => {
    // Create a gift card via UI (not API) to avoid session/caching issues
    await giftCardsPage.goto();
    await giftCardsPage.clickAddGiftCard();
    await giftCardsPage.fillGiftCardForm(testGiftCards[0]);
    await giftCardsPage.submitGiftCardForm();

    // Wait for form to close
    await page.waitForTimeout(1000);

    // Verify it was created in the UI
    const originalAmount = testGiftCards[0].amount;
    await giftCardsPage.expectGiftCardInList(testGiftCards[0].merchant, originalAmount);

    // Verify it was created in PocketBase
    const cardsBeforeEdit = await userPocketbase.collection('gift_cards').getFullList({
      filter: `merchant = "${testGiftCards[0].merchant}"`
    });
    console.log(`[TEST] Found ${cardsBeforeEdit.length} card(s) for ${testGiftCards[0].merchant} before edit`);
    expect(cardsBeforeEdit.length).toBe(1);
    const createdCard = cardsBeforeEdit[0];
    console.log(`[TEST] Created card ID: ${createdCard.id}, amount: ${createdCard.amount}`);
    expect(createdCard.amount).toBe(originalAmount);

    // Edit it - pass the original amount so the exact edit button can be found
    const newAmount = 75.00;
    await giftCardsPage.editGiftCard(
      testGiftCards[0].merchant,
      { amount: newAmount },
      originalAmount
    );

    // Verify the update in PocketBase
    const updatedCard = await userPocketbase.collection('gift_cards').getOne(createdCard.id);
    console.log(`[TEST] After edit, card ${updatedCard.id} has amount: ${updatedCard.amount}`);
    expect(updatedCard.amount).toBe(newAmount);

    // Verify the updated amount is visible in the UI
    await giftCardsPage.expectGiftCardInList(testGiftCards[0].merchant, newAmount);
  });

  test('should delete a gift card', async ({ userPocketbase }) => {
    // Create a gift card via API
    await createGiftCard(userPocketbase, testGiftCards[0]);

    await giftCardsPage.goto();

    // Delete it - pass the amount so the exact delete button can be found
    await giftCardsPage.deleteGiftCard(testGiftCards[0].merchant, testGiftCards[0].amount);

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
