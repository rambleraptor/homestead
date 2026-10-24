/**
 * `POST /conversations/{id}:cancel` — stop the turn running in a conversation.
 *
 * Turns run in this process (`core/server/chat/turns.ts`), so cancelling is an
 * abort through its in-process registry; the runner then marks the assistant
 * message `cancelled` and frees the conversation. Answers `{ cancelled }`:
 * false when no turn was running, which is not an error — the turn may have
 * just finished.
 *
 * The dispatcher only authenticates, so access is checked here: cancelling
 * changes a conversation, so it takes write access to it, proven by a no-op
 * write under the caller's own token.
 *
 * Server-only: lives under `methods/`, so vite stubs it out of the browser bundle.
 */

import { HomesteadError } from '@rambleraptor/homestead-client';
import type { CustomMethodHandler } from '../../resources/types';
import { serverClient } from '../../server/client';
import { cancelTurn } from '../../server/chat/turns';
import { CONVERSATIONS } from '../resources';

const cancel: CustomMethodHandler = async (ctx) => {
  const id = ctx.id!;
  try {
    await serverClient(ctx.auth.token).collection(CONVERSATIONS).record(id).update({});
  } catch (err) {
    if (err instanceof HomesteadError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: err.code });
    }
    throw err;
  }
  return Response.json({ cancelled: cancelTurn(id) });
};

export default cancel;
