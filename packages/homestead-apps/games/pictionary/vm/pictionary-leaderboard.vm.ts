/**
 * Pictionary Leaderboard tests, on the VM tier.
 *
 * A port of ../e2e/pictionary-leaderboard.spec.ts. Seeds games via aepbase
 * REST and verifies that the leaderboard ranks both players and teams.
 */

import { afterEach, beforeEach, describe, test } from 'vitest';
import { bootHomestead, type Harness } from '@rambleraptor/homestead-test-harness/vm/boot';
import { PictionaryPage } from '../e2e/PictionaryPage';
import { createPictionaryGame } from '../e2e/helpers';
import { createPerson } from '../../../people/e2e/helpers';

describe('Pictionary Leaderboard', () => {
  let h: Harness;
  let pictionaryPage: PictionaryPage;
  let userToken: string;

  beforeEach(async () => {
    h = await bootHomestead();
    ({ token: userToken } = await h.loginAs(h.member));
    pictionaryPage = new PictionaryPage(h.driver);
  });

  afterEach(async () => {
    await h.close();
  });

  test('shows the empty state when no games have been played', async () => {
    await pictionaryPage.gotoLeaderboard();
    await pictionaryPage.expectToBeOnLeaderboardPage();
    await pictionaryPage.expectLeaderboardEmpty();
  });

  test('ranks players by wins across multiple games', async () => {
    const alice = await createPerson(userToken, { name: 'Alice Lead' });
    const bob = await createPerson(userToken, { name: 'Bob Lead' });
    const carol = await createPerson(userToken, { name: 'Carol Lead' });

    // Game 1: Alice wins, Bob loses.
    await createPictionaryGame(userToken, {
      location: 'Game 1',
      teams: [
        { players: [`people/${alice.id}`], won: true },
        { players: [`people/${bob.id}`], won: false },
      ],
    });

    // Game 2: Alice wins again, Carol loses.
    await createPictionaryGame(userToken, {
      location: 'Game 2',
      teams: [
        { players: [`people/${alice.id}`], won: true },
        { players: [`people/${carol.id}`], won: false },
      ],
    });

    // Game 3: Bob wins, Carol loses.
    await createPictionaryGame(userToken, {
      location: 'Game 3',
      teams: [
        { players: [`people/${bob.id}`], won: true },
        { players: [`people/${carol.id}`], won: false },
      ],
    });

    await pictionaryPage.goto();
    await pictionaryPage.clickLeaderboard();
    await pictionaryPage.expectToBeOnLeaderboardPage();

    const aliceRow = pictionaryPage.leaderboardRow(alice.id);
    const bobRow = pictionaryPage.leaderboardRow(bob.id);
    const carolRow = pictionaryPage.leaderboardRow(carol.id);

    await h.driver.expect(aliceRow).toBeVisible();
    await h.driver.expect(bobRow).toBeVisible();
    await h.driver.expect(carolRow).toBeVisible();

    await h.driver.expect(aliceRow).toContainText('Alice Lead');
    await h.driver.expect(aliceRow).toContainText('2 wins');
    await h.driver.expect(bobRow).toContainText('1 win');
    await h.driver.expect(carolRow).toContainText('0 wins');
  });

  test('switches to team mode and ranks teams by their roster', async () => {
    const alice = await createPerson(userToken, { name: 'Alice T' });
    const bob = await createPerson(userToken, { name: 'Bob T' });
    const carol = await createPerson(userToken, { name: 'Carol T' });
    const dan = await createPerson(userToken, { name: 'Dan T' });

    // Alice & Bob beat Carol & Dan twice; same rosters each time so the
    // team aggregator collapses them into one row.
    for (let i = 0; i < 2; i++) {
      await createPictionaryGame(userToken, {
        location: `Game ${i + 1}`,
        teams: [
          {
            players: [`people/${alice.id}`, `people/${bob.id}`],
            won: true,
          },
          {
            players: [`people/${carol.id}`, `people/${dan.id}`],
            won: false,
          },
        ],
      });
    }

    await pictionaryPage.gotoLeaderboard();
    await pictionaryPage.selectLeaderboardMode('teams');

    // Team row testid is the sorted player ids joined with `-`.
    const sortedAb = [alice.id, bob.id].sort().join('-');
    const sortedCd = [carol.id, dan.id].sort().join('-');

    const winningTeamRow = pictionaryPage.leaderboardRow(sortedAb);
    const losingTeamRow = pictionaryPage.leaderboardRow(sortedCd);

    await h.driver.expect(winningTeamRow).toBeVisible();
    await h.driver.expect(winningTeamRow).toContainText('Alice T');
    await h.driver.expect(winningTeamRow).toContainText('Bob T');
    await h.driver.expect(winningTeamRow).toContainText('2 wins');
    await h.driver.expect(winningTeamRow).toContainText('2 games');

    await h.driver.expect(losingTeamRow).toBeVisible();
    await h.driver.expect(losingTeamRow).toContainText('0 wins');
    await h.driver.expect(losingTeamRow).toContainText('2 games');
  });
});
