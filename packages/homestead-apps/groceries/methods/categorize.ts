/**
 * `groceries:categorize` custom method (AEP-136).
 *
 * `POST /api/aep/groceries:categorize`, no body. Decides which section of the
 * store every item on the list belongs in — one Gemini Decisions request for
 * the whole list, a multiple-choice question per item — and saves it as the
 * item's `category`. Reads and writes as the caller, so it sorts the items they
 * can see and change.
 *
 * It is a pass over the list rather than a step in adding an item: adding stays
 * a name and Enter, and the list is sorted when someone asks.
 */

import type { CustomMethodHandler } from '@rambleraptor/homestead-core/resources/types';
import { problemResponse, UPSTREAM_FAILED } from '@rambleraptor/homestead-core/resources/problem';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import {
  decideChoices,
  DecisionsError,
  isDecisionsConfigured,
  type ChoiceQuestion,
} from '@rambleraptor/homestead-core/server/ai/decisions';
import { GROCERIES } from '../resources';
import { STORE_SECTIONS } from '../sections';

interface GroceryRecord {
  id: string;
  name?: string;
  category?: string;
}

const CRITERIA = Object.fromEntries(STORE_SECTIONS.map((s) => [s.id, s.description]));
/** Item names are short; a pasted essay shouldn't become the question. */
const MAX_NAME_LENGTH = 200;
/** Updates in flight at once. */
const WRITE_CONCURRENCY = 8;

function questionFor(name: string): ChoiceQuestion {
  return {
    instructions:
      'Which section of a grocery store would a shopper find this shopping-list item in? ' +
      `Ignore any quantity. The item: ${JSON.stringify(name.slice(0, MAX_NAME_LENGTH))}`,
    criteria: CRITERIA,
  };
}

const handler: CustomMethodHandler = async ({ auth }) => {
  if (!isDecisionsConfigured()) {
    return problemResponse(
      503,
      'Sorting by section needs a Gemini API key. A superuser can add one under Superuser → Credentials.',
    );
  }

  const groceries = serverClient(auth.token).collection<GroceryRecord>(GROCERIES);
  const items = (await groceries.listAll()).filter((item) => item.name?.trim());
  if (items.length === 0) {
    return Response.json({ sorted: 0, changed: 0, message: 'There is nothing on the list to sort' });
  }

  // Keyed by position: the API's question keys are short ASCII, record ids needn't be.
  const questions = Object.fromEntries(
    items.map((item, index) => [`i${index}`, questionFor(item.name!.trim())]),
  );
  let answers: Awaited<ReturnType<typeof decideChoices>>;
  try {
    answers = await decideChoices("Items on a household's grocery shopping list.", questions);
  } catch (err) {
    if (err instanceof DecisionsError) return problemResponse(UPSTREAM_FAILED, err.message);
    throw err;
  }

  const changes = items.flatMap((item, index) => {
    const section = answers[`i${index}`]?.choice;
    return section && section !== item.category ? [{ id: item.id, section }] : [];
  });
  for (let i = 0; i < changes.length; i += WRITE_CONCURRENCY) {
    await Promise.all(
      changes
        .slice(i, i + WRITE_CONCURRENCY)
        .map(({ id, section }) => groceries.record(id).update({ category: section })),
    );
  }

  const sorted = Object.keys(answers).length;
  return Response.json({
    sorted,
    changed: changes.length,
    message: `Sorted ${sorted} ${sorted === 1 ? 'item' : 'items'} into sections`,
  });
};

export default handler;
