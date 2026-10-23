/**
 * Bridge CRUD, on the VM tier.
 *
 * A port of ../e2e/bridge-crud.spec.ts — drives the quick-entry UI end to
 * end. Bridge persists hands in localStorage, which every fresh boot starts
 * without.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { BridgePage } from '../e2e/BridgePage';

describe('Bridge CRUD', () => {
  let h: Harness;
  let bridgePage: BridgePage;

  beforeEach(async () => {
    h = await bootHomestead();
    await h.loginAs(h.member);
    bridgePage = new BridgePage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('enters a hand through the UI and shows every direction on the list', async () => {
    await bridgePage.goto();
    await bridgePage.expectToBeOnBridgePage();

    await bridgePage.enterHand(
      {
        north: { level: 3, suit: 'spades' },
        east: { level: 4, suit: 'no-trump' },
        south: { level: 2, suit: 'hearts' },
        west: { level: 7, suit: 'diamonds' },
      },
      5,
    );

    await bridgePage.expectHandInList();
    await bridgePage.expectCardCount(1);
    await bridgePage.expectFirstCardBoard('Board 5');
    await bridgePage.expectFirstCardBid('north', '3♠');
    await bridgePage.expectFirstCardBid('east', '4 NT');
    await bridgePage.expectFirstCardBid('south', '2♥');
    await bridgePage.expectFirstCardBid('west', '7♦');
  });

  test('records multiple hands on the same board', async () => {
    await bridgePage.goto();

    await bridgePage.selectBoard(9);

    await bridgePage.enterHand({
      north: { level: 1, suit: 'clubs' },
      east: { level: 1, suit: 'clubs' },
      south: { level: 1, suit: 'clubs' },
      west: { level: 1, suit: 'clubs' },
    });

    // Board selection persists, so this hand lands on board 9 too.
    await bridgePage.enterHand({
      north: { level: 2, suit: 'hearts' },
      east: { level: 2, suit: 'hearts' },
      south: { level: 2, suit: 'hearts' },
      west: { level: 2, suit: 'hearts' },
    });

    await bridgePage.expectCardCount(2);
    await bridgePage.expectFirstCardBoard('Board 9');
  });

  test("shows only the selected board's hands", async () => {
    await bridgePage.goto();

    // One hand on board 3...
    await bridgePage.enterHand(
      {
        north: { level: 3, suit: 'spades' },
        east: { level: 3, suit: 'spades' },
        south: { level: 3, suit: 'spades' },
        west: { level: 3, suit: 'spades' },
      },
      3,
    );

    // ...and two on board 7.
    await bridgePage.enterHand(
      {
        north: { level: 1, suit: 'clubs' },
        east: { level: 1, suit: 'clubs' },
        south: { level: 1, suit: 'clubs' },
        west: { level: 1, suit: 'clubs' },
      },
      7,
    );
    await bridgePage.enterHand({
      north: { level: 2, suit: 'hearts' },
      east: { level: 2, suit: 'hearts' },
      south: { level: 2, suit: 'hearts' },
      west: { level: 2, suit: 'hearts' },
    });

    // Entering on board 7 leaves the view on board 7: two hands.
    await bridgePage.expectCardCount(2);
    await bridgePage.expectFirstCardBoard('Board 7');

    // Switch the filter to board 3: only its single hand shows.
    await bridgePage.filterByBoard(3);
    await bridgePage.expectCardCount(1);
    await bridgePage.expectFirstCardBoard('Board 3');
    await bridgePage.expectFirstCardBid('north', '3♠');
  });

  test('lists multiple hands newest-first', async () => {
    await bridgePage.goto();

    await bridgePage.enterHand({
      north: { level: 1, suit: 'clubs' },
      east: { level: 1, suit: 'clubs' },
      south: { level: 1, suit: 'clubs' },
      west: { level: 1, suit: 'clubs' },
    });

    await bridgePage.enterHand({
      north: { level: 5, suit: 'hearts' },
      east: { level: 6, suit: 'spades' },
      south: { level: 7, suit: 'no-trump' },
      west: { level: 2, suit: 'diamonds' },
    });

    await bridgePage.expectCardCount(2);
    await bridgePage.expectFirstCardBid('north', '5♥');
    await bridgePage.expectFirstCardBid('south', '7 NT');
  });
});
