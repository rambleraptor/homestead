/**
 * The People app's context for a chat turn (`AppChatConfig.context`): who the
 * speaker is in People, and their family, each with the account they use when
 * they have one — so "remind the kids" and "tell my wife" resolve to people
 * and accounts without asking.
 *
 * Read with the speaker's own token: only people they can see are named.
 */

import type { ChatContextInput } from '@rambleraptor/homestead-core/apps/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { promptName } from '@rambleraptor/homestead-core/server/chat/context';
import { PEOPLE, PERSON_RELATIONSHIPS } from '../resources';
import type { PersonRelationship, RelatedPerson } from '../types';
import { relativesFor } from '../utils/relationships';
import { accountIdOf, personForAccount } from '../utils/accounts';

interface PersonRow {
  id: string;
  name: string;
  user?: string | null;
  update_time?: string;
}

export const NOT_LINKED =
  "The signed-in user isn't linked to a person yet. If they say which person " +
  "they are, set that person's \"user\" field to the signed-in user's id.";

export default async function peopleContext({ token, userId, household }: ChatContextInput): Promise<string[]> {
  const hs = serverClient(token);
  const [people, relationships] = await Promise.all([
    hs.collection<PersonRow>(PEOPLE).listAll(),
    hs.collection<PersonRelationship>(PERSON_RELATIONSHIPS).listAll(),
  ]);
  const me = personForAccount(people, userId);
  if (!me) return [NOT_LINKED];

  // A link counts only when it names someone in the household (a deleted
  // account, or a stray id, links to no one).
  const members = new Set(household.map((m) => m.id));
  const accountById = new Map<string, string>();
  for (const person of people) {
    const account = accountIdOf(person.user);
    if (account && members.has(account) && personForAccount(people, account) === person) {
      accountById.set(person.id, account);
    }
  }
  const describe = (p: { id: string; name: string }): string => {
    const account = accountById.get(p.id);
    return `${promptName(p.name)} (person id ${JSON.stringify(p.id)}${account ? `, user id ${JSON.stringify(account)}` : ''})`;
  };

  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const relatives = relativesFor(me.id, relationships, nameById);
  const lines = [`You are ${describe(me)}.`];
  const group = (label: string, list: RelatedPerson[]) => {
    if (list.length > 0) lines.push(`${label}: ${list.map(describe).join(', ')}.`);
  };
  if (relatives.partner) lines.push(`Your partner: ${describe(relatives.partner)}.`);
  group('Your parents', relatives.parents);
  group('Your children', relatives.children);
  group('Your siblings', relatives.siblings);

  // Household members who aren't family still have a person here.
  const named = new Set([me.id, ...[relatives.partner, ...relatives.parents, ...relatives.children, ...relatives.siblings]
    .filter((p): p is RelatedPerson => !!p)
    .map((p) => p.id)]);
  const others = people.filter((p) => accountById.has(p.id) && !named.has(p.id));
  group('Others in the household', others);
  return lines;
}
