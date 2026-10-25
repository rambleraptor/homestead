/**
 * Writing a person's account link (`person.user`). An account belongs to one
 * person, so linking it clears it from whoever had it before.
 */

import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PEOPLE } from '../resources';
import { otherLinks } from './accounts';

interface LinkRow {
  id: string;
  user?: string | null;
  update_time?: string;
}

/** Link `personId` to `userId`, or unlink it when `userId` is empty. */
export async function setAccountLink(personId: string, userId: string | undefined): Promise<void> {
  await aepbase.update(PEOPLE, personId, { user: userId ? `users/${userId}` : null });
  if (!userId) return;
  const people = await aepbase.list<LinkRow>(PEOPLE);
  await Promise.all(otherLinks(people, userId, personId).map((p) => aepbase.update(PEOPLE, p.id, { user: null })));
}
