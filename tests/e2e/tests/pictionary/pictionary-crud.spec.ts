/**
 * Pictionary E2E Tests — create / list / delete a game with teams.
 *
 * Players are seeded via aepbase REST (fast path) so the UI test only
 * exercises the game form and the list view.
 */

import { test, expect } from '../../fixtures/aepbase.fixture';
import { PictionaryPage } from '../../pages/PictionaryPage';
import {
  createPerson,
  createPictionaryGame,
  deleteAllPictionaryGames,
  deleteAllPersonSharedData,
  deleteAllPeople,
  aepList,
} from '../../utils/aepbase-helpers';

test.describe('Pictionary CRUD', () => {
  let pictionaryPage: PictionaryPage;

  test.beforeEach(async ({ authenticatedPage, userToken }) => {
    pictionaryPage = new PictionaryPage(authenticatedPage);
    await deleteAllPictionaryGames(userToken);
    await deleteAllPersonSharedData(userToken);
    await deleteAllPeople(userToken);
  });

  test('creates a 2-team game with a winning word and lists it', async ({
    userToken,
  }) => {
    const alice = await createPerson(userToken, { name: 'Alice Drawer' });
    const bob = await createPerson(userToken, { name: 'Bob Sketcher' });
    const carol = await createPerson(userToken, { name: 'Carol Doodle' });
    const dan = await createPerson(userToken, { name: 'Dan Scribble' });

    await pictionaryPage.goto();
    await pictionaryPage.expectToBeOnPictionaryPage();
    await pictionaryPage.expectEmptyState();

    await pictionaryPage.clickNewGame();
    await pictionaryPage.fillLocation('Orlando');
    await pictionaryPage.fillWinningWord('Eiffel Tower');

    // Team 0: Alice + Bob (winners)
    await pictionaryPage.addPlayerToTeam(0, alice.id);
    await pictionaryPage.addPlayerToTeam(0, bob.id);
    await pictionaryPage.setWinner(0);

    // Team 1: Carol + Dan
    await pictionaryPage.addPlayerToTeam(1, carol.id);
    await pictionaryPage.addPlayerToTeam(1, dan.id);

    await pictionaryPage.submit();

    // Back on the list view — game shows up.
    await pictionaryPage.expectGameInList();
    await pictionaryPage.expectWinningWord('Eiffel Tower');

    // Verify via API.
    const games = await aepList<{
      id: string;
      location?: string;
      winning_word?: string;
    }>(userToken, 'pictionary-games');
    expect(games).toHaveLength(1);
    expect(games[0].location).toBe('Orlando');
    expect(games[0].winning_word).toBe('Eiffel Tower');

    const teams = await aepList<{ id: string; won?: boolean }>(
      userToken,
      'pictionary-teams',
      ['pictionary-games', games[0].id],
    );
    expect(teams).toHaveLength(2);
    expect(teams.filter((t) => t.won === true)).toHaveLength(1);
  });

  test('shows the winning team on the detail page', async ({ userToken }) => {
    const alice = await createPerson(userToken, { name: 'Alice Win' });
    const bob = await createPerson(userToken, { name: 'Bob Win' });

    await createPictionaryGame(userToken, {
      location: 'Michigan',
      winning_word: 'Bite the bullet',
      teams: [
        { players: [`people/${alice.id}`], won: true },
        { players: [`people/${bob.id}`], won: false },
      ],
    });

    await pictionaryPage.goto();
    await pictionaryPage.openFirstGame();
    await pictionaryPage.expectWinningTeamPlayer('Alice Win');
    await pictionaryPage.expectWinningWord('Bite the bullet');
  });

  test('deletes a game and removes it from the list', async ({ userToken }) => {
    const alice = await createPerson(userToken, { name: 'Alice Del' });
    const bob = await createPerson(userToken, { name: 'Bob Del' });

    await createPictionaryGame(userToken, {
      location: 'Seattle',
      teams: [
        { players: [`people/${alice.id}`], won: true },
        { players: [`people/${bob.id}`], won: false },
      ],
    });

    await pictionaryPage.goto();
    await pictionaryPage.openFirstGame();
    await pictionaryPage.clickDelete();
    await pictionaryPage.confirmDeleteInDialog();

    await pictionaryPage.expectEmptyState();

    const games = await aepList<{ id: string }>(userToken, 'pictionary-games');
    expect(games).toHaveLength(0);
  });
});
