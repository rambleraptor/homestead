/**
 * Bridge E2E Tests — drives the UI end-to-end. Bridge persists hands in
 * localStorage, so the POM clears it before each navigation.
 */

import { test } from '../../fixtures/aepbase.fixture';
import { BridgePage } from '../../pages/BridgePage';

test.describe('Bridge CRUD', () => {
  let bridgePage: BridgePage;

  test.beforeEach(async ({ authenticatedPage }) => {
    bridgePage = new BridgePage(authenticatedPage);
  });

  test('enters a hand through the UI and shows every direction on the list', async () => {
    await bridgePage.goto();
    await bridgePage.expectToBeOnBridgePage();

    await bridgePage.setBid('north', 3, 'spades');
    await bridgePage.setBid('east', 4, 'no-trump');
    await bridgePage.setBid('south', 2, 'hearts');
    await bridgePage.setBid('west', 7, 'diamonds');
    await bridgePage.setNotes('doubled by East');
    await bridgePage.saveHand();

    await bridgePage.expectHandInList();
    await bridgePage.expectCardCount(1);
    await bridgePage.expectFirstCardBid('north', '3♠');
    await bridgePage.expectFirstCardBid('east', '4 NT');
    await bridgePage.expectFirstCardBid('south', '2♥');
    await bridgePage.expectFirstCardBid('west', '7♦');
  });

  test('lists multiple hands newest-first', async () => {
    await bridgePage.goto();

    // First hand — defaults are all 1♣, so just save.
    await bridgePage.saveHand();

    // Second hand
    await bridgePage.setBid('north', 5, 'hearts');
    await bridgePage.setBid('east', 6, 'spades');
    await bridgePage.setBid('south', 7, 'no-trump');
    await bridgePage.setBid('west', 2, 'diamonds');
    await bridgePage.saveHand();

    await bridgePage.expectCardCount(2);
    // Newest hand renders first.
    await bridgePage.expectFirstCardBid('north', '5♥');
    await bridgePage.expectFirstCardBid('south', '7 NT');
  });
});
