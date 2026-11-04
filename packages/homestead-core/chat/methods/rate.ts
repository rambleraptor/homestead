/**
 * `POST /conversations/{c}/chat-messages/{m}:rate` — thumbs up or down on an
 * assistant reply, or `null` to take the rating back.
 *
 * A rating marks the message (so the reply shows it) and files the conversation
 * up to and including that reply as an `eval-case` for superusers to review
 * (`core/server/chat/eval-capture.ts` decides what goes in it). The case is a
 * copy, so it outlives the conversation; clearing the rating deletes it, since
 * the rating is the person agreeing to share the conversation.
 *
 * Only the person who had the conversation can rate it: a conversation is
 * private, and sharing it with an admin is theirs to decide. The message is
 * marked under their own token; the case, which they can't write, is written
 * with a system token.
 *
 * Server-only: lives under `methods/`, so vite stubs it out of the browser bundle.
 */

import { HomesteadError } from '@rambleraptor/homestead-client';
import type { CustomMethodHandler } from '../../resources/types';
import { serverClient } from '../../server/client';
import { withSystemToken } from '../../server/system-token';
import { problemResponse } from '../../resources/problem';
import { referenceId } from '../../resources/references';
import { getAllApps, getAllResourceDefs } from '../../apps/registry';
import { getAiConfig } from '../../server/ai/config';
import { householdFor } from '../../server/household';
import { modelResourcesFor } from '../../server/collection-access';
import { appContext, householdLines, localNow, resolveTimezone } from '../../server/chat/context';
import { buildTranscript, encryptedFieldNames, messagesUpTo } from '../../server/chat/eval-capture';
import { logger } from '../../utils/logger';
import { CHAT_MESSAGES, CONVERSATIONS } from '../resources';
import { EVAL_CASES } from '../../superuser/eval-cases/resources';
import type { Conversation, ReplyRating, StoredChatMessage } from '../types';

const MAX_NOTE_CHARS = 1000;

interface RateBody {
  rating: ReplyRating | null;
  note?: string;
  timezone?: string;
}

function parseBody(body: unknown): RateBody | string {
  if (!body || typeof body !== 'object') return 'expected { rating: "up" | "down" | null, note?, timezone? }';
  const { rating, note, timezone } = body as Record<string, unknown>;
  if (rating !== 'up' && rating !== 'down' && rating !== null) {
    return 'rating must be "up", "down", or null';
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > MAX_NOTE_CHARS)) {
    return `note must be text of at most ${MAX_NOTE_CHARS} characters`;
  }
  if (timezone !== undefined && typeof timezone !== 'string') return 'timezone must be text';
  return { rating, note: note?.trim() || undefined, timezone };
}

const rate: CustomMethodHandler = async (ctx) => {
  const [parentPlural, conversationId] = ctx.parent ?? [];
  const messageId = ctx.id;
  if (parentPlural !== CONVERSATIONS || !conversationId || !messageId) {
    return problemResponse(400, 'rate a message as conversations/{id}/chat-messages/{id}:rate');
  }
  const parsed = parseBody(await ctx.request.json().catch(() => null));
  if (typeof parsed === 'string') return problemResponse(400, parsed);
  const { rating, note, timezone } = parsed;

  const { token, user } = ctx.auth;
  const conversationRef = serverClient(token).collection<Conversation>(CONVERSATIONS).record(conversationId);
  let conversation: Conversation;
  let messages: StoredChatMessage[];
  try {
    conversation = await conversationRef.get();
    messages = await conversationRef
      .collection<StoredChatMessage>(CHAT_MESSAGES)
      .listAll({ orderBy: 'seq' });
  } catch (err) {
    if (err instanceof HomesteadError) return problemResponse(err.code, err.message);
    throw err;
  }
  if (!conversation.created_by || referenceId(conversation.created_by, 'users') !== user.id) {
    return problemResponse(403, 'only the person who had this conversation can rate its replies');
  }
  const upTo = messagesUpTo(messages, messageId);
  const rated = upTo?.at(-1);
  if (!upTo || !rated) return problemResponse(404, `no message "${messageId}" in this conversation`);
  if (rated.role !== 'assistant') return problemResponse(400, 'only the assistant’s replies can be rated');
  if (rated.status === 'streaming') return problemResponse(409, 'this reply is still being written');

  try {
    await conversationRef.collection(CHAT_MESSAGES).record(messageId).update({ rating });
  } catch (err) {
    if (err instanceof HomesteadError) return problemResponse(err.code, err.message);
    throw err;
  }

  const messagePath = `${CONVERSATIONS}/${conversationId}/${CHAT_MESSAGES}/${messageId}`;
  const evalCase = await withSystemToken(async (system) => {
    const cases = serverClient(system).collection<{ id: string; path: string }>(EVAL_CASES);
    const [existing] = await cases.listAll({ filter: `message == ${JSON.stringify(messagePath)}` });
    if (rating === null) {
      if (existing) await cases.record(existing.id).delete();
      return null;
    }
    const { transcript, truncated } = buildTranscript(upTo, encryptedFieldNames(getAllResourceDefs()));
    const content = {
      rating,
      note: note ?? null,
      title: conversation.title,
      transcript,
      truncated,
      context: await turnContext(token, user.id, rated, timezone),
    };
    if (existing) {
      // A re-rating replaces what was captured; a reviewer's `expected` and `status` stay.
      return (await cases.record(existing.id).update(content)).path;
    }
    return (
      await cases.create({
        ...content,
        rated_by: `users/${user.id}`,
        conversation: `${CONVERSATIONS}/${conversationId}`,
        message: messagePath,
        status: 'new',
      })
    ).path;
  });
  return Response.json({ rating, eval_case: evalCase });
};

/**
 * What the turn's prompt was built from, as near as the rating can tell: the
 * prompt isn't stored, so the household and app context are read now (usually
 * moments after the reply), and the clock is the reply's own time.
 */
async function turnContext(
  token: string,
  userId: string,
  rated: StoredChatMessage,
  timezone: string | undefined,
): Promise<Record<string, unknown>> {
  const ai = getAiConfig();
  const zone = resolveTimezone(timezone);
  const household = householdFor(userId);
  let appLines: string[] = [];
  try {
    const reachable = await modelResourcesFor(getAllResourceDefs(), token);
    appLines = await appContext(getAllApps(), new Set(reachable.defs.map((d) => d.singular)), {
      token,
      userId,
      household,
    });
  } catch (err) {
    logger.warn('rate: app context was left out of the eval case', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return {
    model: ai ? `${ai.provider}:${ai.model}` : null,
    timezone: zone,
    replied_at: rated.create_time ?? null,
    local_time: rated.create_time ? localNow(zone, new Date(rated.create_time)) : null,
    household: householdLines(household, userId),
    app_context: appLines,
  };
}

export default rate;
