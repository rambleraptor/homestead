/**
 * Collect the links waiting in one inbox's box and file them as bookmarks.
 *
 * The pull side of the drop box: one loop per `bookmark-inbox`, about once a
 * minute (and at once from "Check now"). Homestead asks; the drop box never
 * calls in.
 *
 * What comes back is treated as a stranger's: the drop box is public and
 * assumed breakable. So only a link's address is taken, and checked again
 * here; who it is for and who may see it come from the inbox record, never
 * from the drop box; and an inbox files at most {@link MAX_LINKS_PER_HOUR} an
 * hour, so the most a broken drop box can do is add that many junk links to a
 * reading list.
 *
 * Exactly once: a bookmark's id is derived from the link's id, so a run that
 * is interrupted before it acknowledges just finds them already filed.
 */

import type { PullHandler } from '@rambleraptor/homestead-core/apps/sync';
import {
  BOX_ID,
  MAX_LINKS_PER_HOUR,
  bookmarkIdFor,
  budgetAt,
  collectedLink,
  inboxOwner,
} from '../dropBox';
import { BOOKMARKS, SAVED_VIA_DROP_BOX, VISIBILITY_HOUSEHOLD, VISIBILITY_PRIVATE } from '../resources';
import type { BookmarkInbox } from '../types';
import { configuredDropBox, dropBoxRequest } from './drop-box';

interface WaitingLink {
  id: string;
  seq: number;
  url: unknown;
  received_at?: unknown;
}

function errorCode(error: unknown): number | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
}

/** The links in a drop box answer that are shaped like links; anything else is dropped. */
function waitingLinks(body: unknown): WaitingLink[] {
  const links = (body as { links?: unknown } | null)?.links;
  if (!Array.isArray(links)) return [];
  return links.filter(
    (link): link is WaitingLink =>
      !!link &&
      typeof link === 'object' &&
      typeof (link as WaitingLink).id === 'string' &&
      Number.isInteger((link as WaitingLink).seq) &&
      (link as WaitingLink).seq > 0,
  );
}

/** When the phone shared it, if the drop box gave a time that is one and isn't in the future. */
function sharedAt(value: unknown, now: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now ? new Date(time).toISOString() : undefined;
}

const handler: PullHandler = async (ctx) => {
  const inbox = ctx.connection as unknown as BookmarkInbox | null;
  const userId = inboxOwner(inbox?.path);
  if (!inbox || !userId || !BOX_ID.test(inbox.box ?? '')) return;

  const dropBox = await configuredDropBox(ctx.token);
  // Not set up (yet): nothing to collect, and nothing wrong with the inbox.
  if (!dropBox) return;

  const res = await dropBoxRequest(dropBox, 'GET', `/boxes/${inbox.box}/links`);
  if (res.status === 404) {
    // The drop box doesn't know this box — it was set up after the inbox, or
    // rebuilt. Register it; links can arrive from now on.
    const registered = await dropBoxRequest(dropBox, 'PUT', `/boxes/${inbox.box}`);
    if (!registered.ok) throw new Error(`the drop box answered ${registered.status} to registering the box`);
    return;
  }
  if (!res.ok) throw new Error(`the drop box answered ${res.status}`);

  const links = waitingLinks(await res.json().catch(() => null));
  if (links.length === 0) return;

  const now = Date.now();
  const budget = budgetAt(ctx.cursor, now);
  const visibility = inbox.visibility === VISIBILITY_HOUSEHOLD ? VISIBILITY_HOUSEHOLD : VISIBILITY_PRIVATE;
  // Filed as the inbox's owner: a private bookmark has to be theirs to be seen.
  const bookmarks = ctx.ownedBy(userId).collection(BOOKMARKS);

  let through = 0;
  let filed = 0;
  let dropped = 0;
  for (const link of links) {
    const url = collectedLink(link.url);
    if (!url) {
      // Not a link: never retried, so acknowledged past.
      dropped += 1;
      through = link.seq;
      continue;
    }
    if (budget.count >= MAX_LINKS_PER_HOUR) break;
    try {
      await bookmarks.create(
        {
          url,
          visibility,
          saved_via: SAVED_VIA_DROP_BOX,
          created_by: `users/${userId}`,
          saved_at: sharedAt(link.received_at, now),
        },
        { id: await bookmarkIdFor(inbox.box, link.id) },
      );
      filed += 1;
      budget.count += 1;
    } catch (error) {
      // Filed by an earlier run that didn't get to acknowledge it.
      if (errorCode(error) !== 409) throw error;
    }
    through = link.seq;
  }

  if (through > 0) {
    const ack = await dropBoxRequest(dropBox, 'POST', `/boxes/${inbox.box}/ack`, { through });
    if (!ack.ok) throw new Error(`the drop box answered ${ack.status} to the acknowledgement`);
  }
  if (filed > 0 || dropped > 0) {
    await ctx.log(
      `filed ${filed} link${filed === 1 ? '' : 's'}` + (dropped > 0 ? `, dropped ${dropped} that weren't links` : ''),
    );
  }
  if (budget.count >= MAX_LINKS_PER_HOUR && through < links[links.length - 1]!.seq) {
    await ctx.log(`this hour's limit of ${MAX_LINKS_PER_HOUR} links is reached; the rest wait in the drop box`);
  }
  return { cursor: JSON.stringify(budget) };
};

export default handler;
