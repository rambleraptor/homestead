/**
 * The deployed Worker: `./app` over D1, with the per-sender rate limit and the
 * daily sweep. Set the admin secret with `wrangler secret put ADMIN_SECRET`.
 */

import { handle, sweep } from './app';
import { d1Store, type D1Like } from './d1-store';

interface Env {
  DB: D1Like;
  ADMIN_SECRET?: string;
  /** Cloudflare's rate limiting binding; absent in a setup that doesn't declare one. */
  SENDERS?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const limiter = env.SENDERS;
    return handle(request, {
      store: d1Store(env.DB),
      adminSecret: env.ADMIN_SECRET,
      allow: limiter ? async (sender) => (await limiter.limit({ key: sender })).success : undefined,
    });
  },

  async scheduled(_event: unknown, env: Env): Promise<void> {
    await sweep(d1Store(env.DB));
  },
};
