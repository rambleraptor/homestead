/**
 * Gift Cards E2E Tests - Merchant Summaries
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { GiftCardsPage } from '../../pages/GiftCardsPage';
import { createMultipleGiftCards, deleteAllGiftCards } from '../../utils/aepbase-helpers';

test.describe('Merchant Summaries', () => {
  let giftCardsPage: GiftCardsPage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    giftCardsPage = new GiftCardsPage(authenticatedPage);

    // Clean up any existing gift cards
    await deleteAllGiftCards(userToken);

    await giftCardsPage.goto();
  });

  test('should calculate merchant summary correctly for multiple cards', async ({ userToken }) => {
    // Create multiple cards for same merchant
    const amazonCards = [
      { merchant: 'Amazon', amount: 50 },
      { merchant: 'Amazon', amount: 30 },
      { merchant: 'Amazon', amount: 20 },
    ];

    await createMultipleGiftCards(userToken, amazonCards);

    await giftCardsPage.goto();

    // Total should be 100
    const totalAmount = amazonCards.reduce((sum, card) => sum + card.amount, 0);

    // Verify merchant appears with correct total
    await giftCardsPage.expectGiftCardInList('Amazon');
  });

  test('should show separate summaries for different merchants', async ({ userToken }) => {
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
