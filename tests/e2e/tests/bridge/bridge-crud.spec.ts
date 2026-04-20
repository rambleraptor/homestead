/**
 * Bridge E2E Tests — happy-path for creating a hand and verifying that
 * every direction's bid renders on the list page.
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { BridgePage } from '../../pages/BridgePage';
import {
  aepList,
  createBridgeHand,
  deleteAllBridgeHands,
} from '../../utils/aepbase-helpers';

test.describe('Bridge CRUD', () => {
  let bridgePage: BridgePage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    bridgePage = new BridgePage(authenticatedPage);
    await deleteAllBridgeHands(userToken);
  });

  test('enters a hand through the UI and shows every direction on the list', async ({
    userToken,
  }) => {
    await bridgePage.goto();
    await bridgePage.expectToBeOnBridgePage();

    await bridgePage.clickNewHand();
    await bridgePage.setBid('north', 3, 'spades');
    await bridgePage.setBid('east', 4, 'no-trump');
    await bridgePage.setBid('south', 2, 'hearts');
    await bridgePage.setBid('west', 7, 'diamonds');
    await bridgePage.setNotes('doubled by East');
    await bridgePage.saveHand();

    await bridgePage.expectHandInList();

    // Persisted via aepbase — read back through the REST API.
    const hands = await aepList<{
      id: string;
      north_level: number;
      north_suit: string;
      south_level: number;
      south_suit: string;
      east_level: number;
      east_suit: string;
      west_level: number;
      west_suit: string;
      notes?: string;
    }>(userToken, 'hands');
    expect(hands).toHaveLength(1);
    const [hand] = hands;
    expect(hand.north_level).toBe(3);
    expect(hand.north_suit).toBe('spades');
    expect(hand.east_level).toBe(4);
    expect(hand.east_suit).toBe('no-trump');
    expect(hand.south_level).toBe(2);
    expect(hand.south_suit).toBe('hearts');
    expect(hand.west_level).toBe(7);
    expect(hand.west_suit).toBe('diamonds');
    expect(hand.notes).toBe('doubled by East');

    // The rendered card exposes all four direction bids on one page.
    await bridgePage.expectBidInCard(hand.id, 'north', '3♠');
    await bridgePage.expectBidInCard(hand.id, 'east', '4 NT');
    await bridgePage.expectBidInCard(hand.id, 'south', '2♥');
    await bridgePage.expectBidInCard(hand.id, 'west', '7♦');
  });

  test('shows hands seeded via the API alongside fresh ones', async ({
    userToken,
  }) => {
    const seeded = await createBridgeHand(userToken, {
      north_level: 1,
      north_suit: 'clubs',
      south_level: 5,
      south_suit: 'diamonds',
      east_level: 6,
      east_suit: 'hearts',
      west_level: 2,
      west_suit: 'spades',
    });

    await bridgePage.goto();
    await bridgePage.expectHandInList();
    await bridgePage.expectBidInCard(seeded.id, 'north', '1♣');
    await bridgePage.expectBidInCard(seeded.id, 'south', '5♦');
    await bridgePage.expectBidInCard(seeded.id, 'east', '6♥');
    await bridgePage.expectBidInCard(seeded.id, 'west', '2♠');
  });
});
