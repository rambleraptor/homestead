/**
 * `POST /mcp-servers/{id}:connect` with `{ redirect_uri }` — start signing in
 * to a server whose credential is an OAuth one. Returns
 * `{ authorization_url }`, the provider's sign-in page, which comes back to
 * `redirect_uri` (the SPA's callback page) with a code. Superusers only.
 *
 * Server-only: lives under `methods/`, so vite stubs it out of the browser bundle.
 */

import type { CustomMethodHandler } from '../../../resources/types';
import { checkRedirectUri, startConnect } from '../../../server/mcp/oauth';
import { error, loadOAuthServer, signInFailure } from './oauth-common';

const connect: CustomMethodHandler = async (ctx) => {
  const loaded = await loadOAuthServer(ctx);
  if (!loaded.ok) return loaded.response;
  let redirectUri: string;
  try {
    const body = (await ctx.request.json().catch(() => ({}))) as { redirect_uri?: unknown };
    redirectUri = checkRedirectUri(body.redirect_uri);
  } catch (err) {
    return error(400, err instanceof Error ? err.message : String(err));
  }
  try {
    const { authorizationUrl } = await startConnect({
      credential: loaded.credential,
      serverId: loaded.server.id,
      serverUrl: loaded.server.url,
      userId: ctx.auth.user.id,
      redirectUri,
    });
    return Response.json({ authorization_url: authorizationUrl });
  } catch (err) {
    return signInFailure(err);
  }
};

export default connect;
