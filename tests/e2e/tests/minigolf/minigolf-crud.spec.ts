/**
 * Minigolf E2E Tests — full happy-path.
 *
 * Seeds 2 players via aepbase, then plays a short game through the UI
 * using the ScoreStepper controls, confirms winner, confirms the game
 * appears in the list.
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { MinigolfPage } from '../../pages/MinigolfPage';
import {
  createPerson,
  deleteAllGames,
  deleteAllPeople,
  deleteAllPersonSharedData,
  aepList,
} from '../../utils/aepbase-helpers';

test.describe('Minigolf CRUD', () => {
  let minigolfPage: MinigolfPage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    minigolfPage = new MinigolfPage(authenticatedPage);

    // Clean slate — games first (children of none), then people + shared data.
    await deleteAllGames(userToken);
    await deleteAllPersonSharedData(userToken);
    await deleteAllPeople(userToken);
  });

  test('plays a 2-hole game, declares a winner, and lists it', async ({
    userToken,
  }) => {
    // Seed two players via API (fast path).
    const alice = await createPerson(userToken, { name: 'Alice Stroker' });
    const bob = await createPerson(userToken, { name: 'Bob Putts' });

    await minigolfPage.goto();
    await minigolfPage.expectToBeOnMinigolfPage();

    // New game setup
    await minigolfPage.clickNewGame();
    await minigolfPage.selectPlayerByName(alice.id, 'Alice');
    await minigolfPage.selectPlayerByName(bob.id, 'Bob');
    await minigolfPage.setHoleCount(2);
    await minigolfPage.startGame();

    // Hole 1 — par 3, Alice 3, Bob 5
    await minigolfPage.expectOnHole(1, 2);
    await minigolfPage.setPar(3);
    await minigolfPage.setStrokesFor(alice.id, 3);
    await minigolfPage.setStrokesFor(bob.id, 5);
    await minigolfPage.tapNext();

    // Hole 2 — par 4, Alice 4, Bob 4
    await minigolfPage.expectOnHole(2, 2);
    await minigolfPage.setPar(4);
    await minigolfPage.setStrokesFor(alice.id, 4);
    await minigolfPage.setStrokesFor(bob.id, 4);
    await minigolfPage.tapFinish();

    // Alice: 3+4=7, Bob: 5+4=9 → Alice wins
    await minigolfPage.expectWinner('Alice Stroker');
    await minigolfPage.expectTotalFor(alice.id, 7);
    await minigolfPage.expectTotalFor(bob.id, 9);

    // Game should be persisted + completed.
    const games = await aepList<{
      id: string;
      completed?: boolean;
      hole_count: number;
    }>(userToken, 'games');
    expect(games).toHaveLength(1);
    expect(games[0].completed).toBe(true);
    expect(games[0].hole_count).toBe(2);

    // Back to list — the game should show up.
    await minigolfPage.backToList();
    await minigolfPage.expectGameInList();
  });

  test('records ties as multiple winners', async ({ userToken }) => {
    const alice = await createPerson(userToken, { name: 'Alice Tie' });
    const bob = await createPerson(userToken, { name: 'Bob Tie' });

    await minigolfPage.goto();
    await minigolfPage.clickNewGame();
    await minigolfPage.selectPlayerByName(alice.id, 'Alice');
    await minigolfPage.selectPlayerByName(bob.id, 'Bob');
    await minigolfPage.setHoleCount(1);
    await minigolfPage.startGame();

    await minigolfPage.setPar(3);
    await minigolfPage.setStrokesFor(alice.id, 3);
    await minigolfPage.setStrokesFor(bob.id, 3);
    await minigolfPage.tapFinish();

    // Both shown as winners on a tie.
    await minigolfPage.expectWinner('Alice Tie');
    await minigolfPage.expectWinner('Bob Tie');
  });
});
