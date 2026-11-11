/**
 * The Baby app's context for a chat turn (`AppChatConfig.context`): each baby
 * by name and id, and where things stand right now, so "when did she last
 * eat?" and "log a wet diaper" need no lookup first.
 *
 * Read with the speaker's own token: only babies they can see are named.
 */

import type { ChatContextInput } from '@rambleraptor/homestead-core/apps/types';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { promptName } from '@rambleraptor/homestead-core/server/chat/context';
import { babyAge, babyStatus, describeEvent, formatAgo, formatDuration, startedAt } from '../baby';
import { BABIES, BABY_EVENTS } from '../resources';
import type { Baby, BabyEvent } from '../types';

/** How far back "the last feed" is looked for. */
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
/** Twins are plausible; a nursery isn't. */
const MAX_BABIES = 4;

export default async function babyContext({ token }: ChatContextInput): Promise<string[]> {
  const hs = serverClient(token);
  const babies = (await hs.collection<Baby>(BABIES).listAll()).slice(0, MAX_BABIES);
  const now = Date.now();
  const since = new Date(now - LOOKBACK_MS).toISOString();
  const lines: string[] = [];

  for (const baby of babies) {
    const events = (
      await hs
        .collection(BABIES)
        .record(baby.id)
        .collection<BabyEvent>(BABY_EVENTS)
        .listAll({ filter: `started_at >= ${JSON.stringify(since)}` })
    ).map((event) => ({ ...event, baby: baby.id }));
    const status = babyStatus(events, now);
    const age = babyAge(baby.birth_date, new Date(now));
    const facts: string[] = [];
    if (status.lastFeed) {
      facts.push(`last feed ${formatAgo(startedAt(status.lastFeed), now)} (${describeEvent(status.lastFeed)})`);
    }
    if (status.lastDiaper) {
      facts.push(`last diaper ${formatAgo(startedAt(status.lastDiaper), now)} (${describeEvent(status.lastDiaper)})`);
    }
    if (status.sleeping) {
      const start = new Date(startedAt(status.sleeping)).getTime();
      facts.push(`asleep for ${formatDuration(now - start)} (sleep event id ${JSON.stringify(status.sleeping.id)})`);
    } else if (status.awakeSince) {
      facts.push(`awake for ${formatDuration(now - new Date(status.awakeSince).getTime())}`);
    }
    lines.push(
      `Baby ${promptName(baby.name)} (baby id ${JSON.stringify(baby.id)}${age ? `, ${age}` : ''}): ` +
        (facts.length > 0 ? `${facts.join('; ')}.` : 'nothing logged in the last three days.'),
    );
  }
  return lines;
}
