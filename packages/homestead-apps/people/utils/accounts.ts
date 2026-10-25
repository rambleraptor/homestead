/**
 * Pure helpers for a person's link to their Homestead account (`person.user`).
 * No client imports, so the chat context and the SPA read links the same way.
 */

/** The bare user id a stored link holds (`users/u1` or `u1`), or undefined. */
export function accountIdOf(ref: string | null | undefined): string | undefined {
  if (!ref) return undefined;
  return ref.startsWith('users/') ? ref.slice('users/'.length) : ref;
}

interface Linkable {
  id: string;
  user?: string | null;
  update_time?: string;
}

/**
 * The person linked to `userId`. The engine has no unique constraint, so a
 * second link can exist (written before the app moved it); the most recently
 * updated one wins.
 */
export function personForAccount<P extends Linkable>(people: readonly P[], userId: string): P | undefined {
  let found: P | undefined;
  for (const person of people) {
    if (accountIdOf(person.user) !== userId) continue;
    if (!found || (person.update_time ?? '') > (found.update_time ?? '')) found = person;
  }
  return found;
}

/** The people other than `personId` whose link is `userId` — to clear when it moves. */
export function otherLinks<P extends Linkable>(people: readonly P[], userId: string, personId: string): P[] {
  return people.filter((p) => p.id !== personId && accountIdOf(p.user) === userId);
}
