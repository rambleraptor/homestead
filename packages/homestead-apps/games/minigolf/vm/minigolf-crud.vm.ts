/**
 * Minigolf CRUD, on the VM tier — full happy-path.
 *
 * A port of ../e2e/minigolf-crud.spec.ts: seeds 2 players via aepbase, then
 * plays a short game through the UI using the ScoreStepper controls, confirms
 * winner, confirms the game appears in the list.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { listOrEmpty } from '../../../../../tests/e2e/utils/aepbase-helpers';
import { MinigolfPage } from '../e2e/MinigolfPage';
import { createPerson } from '../../../people/e2e/helpers';

describe('Minigolf CRUD', () => {
  let h: Harness;
  let minigolfPage: MinigolfPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    minigolfPage = new MinigolfPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('plays a 2-hole game, declares a winner, and lists it', async () => {
    // Seed two players via API (fast path).
    const alice = await createPerson(userToken, { name: 'Alice Stroker' });
    const bob = await createPerson(userToken, { name: 'Bob Putts' });

    await minigolfPage.goto();
    await minigolfPage.expectToBeOnMinigolfPage();

    // New game setup
    await minigolfPage.clickNewGame();
    await minigolfPage.selectPlayerById(alice.id);
    await minigolfPage.selectPlayerById(bob.id);
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
    const games = await listOrEmpty<{
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

  test('records ties as multiple winners', async () => {
    const alice = await createPerson(userToken, { name: 'Alice Tie' });
    const bob = await createPerson(userToken, { name: 'Bob Tie' });

    await minigolfPage.goto();
    await minigolfPage.clickNewGame();
    await minigolfPage.selectPlayerById(alice.id);
    await minigolfPage.selectPlayerById(bob.id);
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
