/**
 * `POST /mcp-servers/{id}:finish-connect` with `{ code, state }` — finish a
 * sign-in the provider sent back to the SPA, then check the server, fetching
 * its tools. Returns the updated server. Superusers only, and only the one who
 * started the sign-in: the `state` is bound to them.
 *
 * Server-only: lives under `methods/`, so vite stubs it out of the browser bundle.
 */

import type { CustomMethodHandler } from '../../../resources/types';
import { finishConnect } from '../../../server/mcp/oauth';
import { checkServer } from './refresh-tools';
import { error, loadOAuthServer, signInFailure } from './oauth-common';

const finish: CustomMethodHandler = async (ctx) => {
  const loaded = await loadOAuthServer(ctx);
  if (!loaded.ok) return loaded.response;
  const body = (await ctx.request.json().catch(() => ({}))) as { code?: unknown; state?: unknown };
  if (typeof body.code !== 'string' || !body.code || typeof body.state !== 'string' || !body.state) {
    return error(400, 'send the code and state the provider returned');
  }
  try {
    await finishConnect({ serverId: loaded.server.id, userId: ctx.auth.user.id, state: body.state, code: body.code });
  } catch (err) {
    return signInFailure(err);
  }
  return Response.json(await checkServer(ctx.auth.token, loaded.server));
};

export default finish;
