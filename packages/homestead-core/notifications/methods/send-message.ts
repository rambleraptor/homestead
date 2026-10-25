/**
 * `POST /users/{id}/notifications:send` — send a household member a message:
 * a push to their devices and a row in their inbox, from you (AEP-136,
 * collection-target on the recipient's inbox).
 *
 * The dispatcher only authenticates, so the rules are here:
 *  - the caller must be able to write notifications — every signed-in member
 *    can (their own inbox), a personal access token only if it was granted
 *    that, a read-only connection never;
 *  - both people must be in the household, and the content within limits
 *    (`sendMessage`);
 *  - ten messages an hour per sender.
 *
 * Server-only: lives under `methods/`, so vite stubs it out of the browser bundle.
 */

import type { CustomMethodHandler } from '../../resources/types';
import { canWriteCollection } from '../../server/collection-access';
import { householdMembers } from '../../server/household';
import { checkMessage, MessageError, sendMessage, takeMessageSlot } from '../../server/messages';

const error = (status: number, message: string, headers?: Record<string, string>) =>
  Response.json({ error: { code: status, message } }, { status, headers });

const send: CustomMethodHandler = async ({ auth, parent, request }) => {
  const to = parent?.[0] === 'users' ? parent[1] : undefined;
  if (!to) return error(400, 'address the recipient: /users/{id}/notifications:send');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return error(400, 'send a JSON body: { "title": "…", "body": "…", "url": "/…" }');
  }
  if (!body || typeof body !== 'object') return error(400, 'send a JSON object');

  if (!(await canWriteCollection(auth.token, 'notification'))) {
    return error(403, 'this credential may not send messages');
  }
  try {
    // Everything that can refuse the message runs before a slot is spent, so a
    // refused one doesn't count against the sender.
    checkMessage(body);
    const members = householdMembers();
    if (!members.some((m) => m.id === auth.user.id)) {
      throw new MessageError(403, 'only household members can send messages');
    }
    if (!members.some((m) => m.id === to)) {
      throw new MessageError(404, `no one in the household has user id "${to}"`);
    }
    const slot = takeMessageSlot(auth.user.id);
    if (!slot.ok) {
      return error(429, 'too many messages; try again later', { 'Retry-After': String(slot.retryAfter) });
    }
    return Response.json(
      await sendMessage({
        from: auth.user.id,
        to,
        title: body.title as string,
        body: body.body as string | undefined,
        url: body.url as string | undefined,
      }),
    );
  } catch (err) {
    if (err instanceof MessageError) return error(err.status, err.message);
    throw err;
  }
};

export default send;
